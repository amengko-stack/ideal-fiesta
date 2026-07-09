import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs, query, where, doc, getDoc, setDoc, addDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M, mobileCss } from "../styles/mobileTheme.js";
import { computeStreak } from "../lib/streak.js";
import { toLocalDateStr } from "../lib/dates.js";
import Header from "../ui/Header.jsx";
import BottomNav from "../ui/BottomNav.jsx";
import BottomSheet from "../ui/BottomSheet.jsx";
import Toast from "../ui/Toast.jsx";
import HomeScreen from "./HomeScreen.jsx";
import LoadScreen from "./LoadScreen.jsx";
import LogSheet from "./LogSheet.jsx";
import CheckinSheet from "./CheckinSheet.jsx";
import MatchesScreen from "./MatchesScreen.jsx";
import MatchDetailSheet from "./MatchDetailSheet.jsx";
import TournamentSheet from "./TournamentSheet.jsx";
import ImportSheet from "./ImportSheet.jsx";
import PlanScreen from "./PlanScreen.jsx";
import MeScreen from "./MeScreen.jsx";
import BadgeSheet from "./BadgeSheet.jsx";
import GrowthSheet from "./GrowthSheet.jsx";
import BenchmarkSheet from "./BenchmarkSheet.jsx";
import StrokeSheet from "./StrokeSheet.jsx";
import ProfileSheet from "./ProfileSheet.jsx";
import { mergeWellbeingByDate } from "../lib/load.js";
import { generateSeasonReport } from "../lib/seasonReport.js";
import { generateMatchAnalysis } from "../lib/matchAnalysis.js";
import { acwrStatus, computeLoad } from "../lib/load.js";
import { daysUntil, nearestUpcoming } from "../lib/tournaments.js";
import { generateSundayPlan } from "../lib/planGen.js";
import { awardXp } from "../lib/gamificationStore.js";
import { XP, levelFromXp } from "../lib/gamification.js";
import { BADGES, evaluateBadges } from "../lib/badges.js";
import { resolveDeferred } from "../lib/deferredPriorities.js";

const SCREENS = {
  home:    { kicker: null,              label: "Home",    emoji: "🏠" },
  load:    { kicker: "Training load",   label: "Load",    emoji: "📊" },
  matches: { kicker: "Season so far",   label: "Matches", emoji: "🎾" },
  plan:    { kicker: "Your plan",       label: "Plan",    emoji: "📋" },
  me:      { kicker: "Profile & tools", label: "Profile", emoji: "⭐" },
};

export default function MobileApp({ athleteId, isParent, onSignOut }) {
  const [screen, setScreen]     = useState("home");
  const [profile, setProfile]   = useState(null);
  const [weekLogs, setWeekLogs] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [wellbeing, setWellbeing] = useState([]);
  const [xp, setXp]             = useState(0);
  const [streakInfo, setStreakInfo] = useState({ current: 0, activeThisWeek: 0 });
  const [matches, setMatches]   = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [seasonReport, setSeasonReport] = useState(null);
  const [planResult, setPlanResult] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [sheet, setSheet]       = useState(null); // null | "log" | "checkin" | "tournament" | "import"
  const [earnedBadges, setEarnedBadges] = useState({});
  const [badgeSheet, setBadgeSheet] = useState(null); // null | BADGES entry
  const [toast, setToast]       = useState(null);
  const [tick, setTick]         = useState(0);
  const [priorities, setPriorities] = useState([]);
  const [benchmarks, setBenchmarks] = useState([]);
  const [technical, setTechnical] = useState([]);
  const [parentMode, setParentMode] = useState(() => {
    try { return localStorage.getItem("parentMode") !== "0"; } catch { return true; }
  });
  const toastTimer = useRef(null);

  const [detailMatch, setDetailMatch] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [seasonLoading, setSeasonLoading] = useState(false);

  // Tracks which match the detail sheet currently shows, so a slow analysis
  // generation can't render its report under a different match (or a closed sheet).
  const detailMatchIdRef = useRef(null);

  const openMatch = (m) => {
    detailMatchIdRef.current = String(m.matchId || m.id);
    setDetailMatch(m);
    setAnalysis(null);
    setAnalysisLoading(true);
    getDoc(doc(db, "athletes", athleteId, "matchAnalyses", String(m.matchId || m.id)))
      .then(snap => setAnalysis(snap.exists() ? snap.data() : null))
      .catch(() => setAnalysis(null))
      .finally(() => setAnalysisLoading(false));
  };

  const closeMatch = () => {
    detailMatchIdRef.current = null;
    setDetailMatch(null);
  };

  const [analysisGenerating, setAnalysisGenerating] = useState(false);
  const generateAnalysis = async () => {
    if (analysisGenerating || !detailMatch) return;
    const forId = String(detailMatch.matchId || detailMatch.id);
    setAnalysisGenerating(true);
    try {
      const { analysis: report } = await generateMatchAnalysis(athleteId, detailMatch);
      if (detailMatchIdRef.current === forId) {
        setAnalysis(report);
        showToast("Coaching report ready 🧠");
      }
      refresh();
    } catch (e) {
      console.error("Match analysis:", e);
      if (detailMatchIdRef.current === forId) showToast("Couldn't analyse — try again later 🙈");
    } finally {
      setAnalysisGenerating(false);
    }
  };

  const deleteMatch = () => {
    if (!detailMatch) return;
    deleteDoc(doc(db, "matches", String(detailMatch.id || detailMatch.matchId)))
      .catch(e => console.error("Match delete:", e));
    closeMatch();
    onSaved("Match deleted 🗑️");
  };

  const finishSession = (difficulty) => {
    if (!planResult) return;
    const now = new Date();
    const exercises = (planResult.plan || []).map(ex => ({
      id: ex.id, name: ex.name,
      sets: ex.sets ?? null, reps: ex.reps ?? null, weight: "",
      difficulty, completed: !!planResult.doneMap?.[ex.id], notes: "",
    }));
    // Same shape the classic StrengthLogTab writes — the plan generator's
    // exercise-progression memory reads this collection.
    addDoc(collection(db, "athletes", athleteId, "sessions"), {
      date: toLocalDateStr(now), time: now.toTimeString().slice(0, 5), exercises,
    }).catch(e => console.error("finishSession save:", e));
    setDoc(doc(db, "athletes", athleteId, "plans", "current"), { sessionLogged: true }, { merge: true })
      .catch(e => console.error("sessionLogged flag:", e));
    setPlanResult(prev => (prev ? { ...prev, sessionLogged: true } : prev));
    onSaved("Session logged — the AI will build on it next week 💪");
  };

  const generateSeason = async () => {
    if (seasonLoading) return;
    setSeasonLoading(true);
    try {
      const report = await generateSeasonReport(athleteId, matches);
      setSeasonReport(report);
      showToast("Season analysis ready 🧠");
    } catch (e) {
      console.error("Season generation:", e);
      showToast("Couldn't generate — try again later 🙈");
    } finally {
      setSeasonLoading(false);
    }
  };

  const generatePlan = async (mode) => {
    if (planLoading) return;
    setPlanLoading(true);
    try {
      const { planData } = await generateSundayPlan(athleteId, {
        profile, weekLogs, sessionHistory, wellbeing,
        tournament: mode, sessionTime: "10:00",
      });
      setPlanResult(planData);
      let msg = "Plan ready! 💪";
      try { await awardXp(athleteId, XP.PLAN_GENERATE); msg = `Plan ready! +${XP.PLAN_GENERATE} XP 💪`; } catch { /* xp optional */ }
      showToast(msg);
    } catch (e) {
      console.error("Plan generation:", e);
      showToast("Couldn't build the plan — try again 🙈");
    } finally {
      setPlanLoading(false);
    }
  };

  const toggleExercise = (exId) => {
    setPlanResult(prev => {
      if (!prev) return prev;
      const doneMap = { ...(prev.doneMap || {}), [exId]: !prev.doneMap?.[exId] };
      setDoc(doc(db, "athletes", athleteId, "plans", "current"), { doneMap }, { merge: true })
        .catch(err => console.error("doneMap save:", err));
      return { ...prev, doneMap };
    });
  };

  const toggleGap = (gapId) => {
    setProfile(prev => {
      if (!prev) return prev;
      const cur = prev.gaps || [];
      const gaps = cur.includes(gapId) ? cur.filter(g => g !== gapId) : [...cur, gapId];
      setDoc(doc(db, "athletes", athleteId), { gaps }, { merge: true })
        .catch(err => console.error("gaps save:", err));
      return { ...prev, gaps };
    });
  };

  const resolvePriority = async (priorityLabel) => {
    try {
      await resolveDeferred(athleteId, priorityLabel);
      showToast("Nice — priority resolved! 🎉");
      refresh();
    } catch (e) {
      console.error("resolve priority:", e);
      showToast("Couldn't update — try again 🙈");
    }
  };

  const toggleParentMode = () => {
    setParentMode(p => {
      const next = !p;
      try { localStorage.setItem("parentMode", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const cutoff = toLocalDateStr(cutoffDate);

    // allSettled: one unreachable doc (e.g. first offline launch with a cold
    // cache) degrades that slice of the UI instead of blanking the whole app.
    Promise.allSettled([
      getDoc(doc(db, "athletes", athleteId)),
      getDocs(query(collection(db, "athletes", athleteId, "weekLogs"), where("date", ">=", cutoff))),
      getDocs(query(collection(db, "athletes", athleteId, "wellbeing"), where("date", ">=", cutoff))),
      getDocs(query(collection(db, "athletes", athleteId, "sessions"), where("date", ">=", cutoff))),
      getDoc(doc(db, "athletes", athleteId, "gamification", "state")),
      getDocs(collection(db, "matches")),
      getDocs(collection(db, "athletes", athleteId, "tournaments")),
      getDoc(doc(db, "athletes", athleteId, "reports", "seasonLatest")),
      getDoc(doc(db, "athletes", athleteId, "plans", "current")),
      getDocs(collection(db, "athletes", athleteId, "deferredPriorities")),
      getDocs(collection(db, "athletes", athleteId, "benchmarks")),
      getDocs(collection(db, "athletes", athleteId, "technicalAssessments")),
    ])
      .then((results) => {
        if (cancelled) return;
        const val = (i) => (results[i].status === "fulfilled" ? results[i].value : null);
        const failed = results.filter(r => r.status === "rejected");
        if (failed.length) console.error(`MobileApp data load: ${failed.length}/12 reads failed`, failed[0].reason);
        const [profileSnap, logsSnap, wbSnap, sessSnap, xpSnap, matchesSnap, tournamentsSnap, seasonSnap, planSnap, prioritiesSnap, benchmarksSnap, technicalSnap] =
          results.map((_, i) => val(i));
        if (profileSnap?.exists()) setProfile({ id: profileSnap.id, ...profileSnap.data() });
        const logs = logsSnap ? logsSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
        const wb   = wbSnap ? wbSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
        const sess = sessSnap ? sessSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
        if (logsSnap) setWeekLogs(logs);
        if (wbSnap) setWellbeing(wb);
        if (sessSnap) setSessionHistory(sess);
        if (xpSnap) setXp(xpSnap.exists() ? xpSnap.data().xp || 0 : 0);
        if (matchesSnap) setMatches(matchesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (tournamentsSnap) setTournaments(tournamentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (seasonSnap) setSeasonReport(seasonSnap.exists() ? seasonSnap.data() : null);
        if (planSnap) setPlanResult(planSnap.exists() ? planSnap.data() : null);
        if (prioritiesSnap) setPriorities(
          prioritiesSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => p.status === "active" || p.status === "escalated")
        );
        if (benchmarksSnap) setBenchmarks(benchmarksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (technicalSnap) setTechnical(technicalSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const dates = [
          ...logs.map(l => l.date),
          ...wb.map(w => w.date),
          ...sess.map(s => s.date),
        ].filter(Boolean);
        const streak = computeStreak(dates, toLocalDateStr(new Date()));
        setStreakInfo(streak);

        // Badge evaluation only with a trustworthy picture: skip when any read
        // failed so a degraded load can't mis-award or double-toast.
        if (failed.length > 0 || !xpSnap) return;
        const stored = xpSnap.exists() ? xpSnap.data().badges || {} : {};
        setEarnedBadges(stored);
        const xpVal = xpSnap.exists() ? xpSnap.data().xp || 0 : 0;
        const planDoc = planSnap?.exists() ? planSnap.data() : null;
        const stats = {
          sessionCount: logs.length,
          streak: streak.current,
          wins: matchesSnap.docs.filter(d => d.data().whoWonMatch === 1).length,
          checkinDays: new Set(wb.map(w => w.date)).size,
          level: levelFromXp(xpVal).level,
          planCompleted: !!(planDoc && (planDoc.plan || []).length > 0 && (planDoc.plan || []).every(ex => planDoc.doneMap?.[ex.id])),
        };
        const satisfied = evaluateBadges(stats);
        const fresh = satisfied.filter(id => !stored[id]);
        if (fresh.length > 0) {
          const today = toLocalDateStr(new Date());
          const additions = Object.fromEntries(fresh.map(id => [id, today]));
          setEarnedBadges({ ...stored, ...additions });
          setDoc(doc(db, "athletes", athleteId, "gamification", "state"),
            { badges: { ...stored, ...additions } }, { merge: true })
            .catch(err => console.error("badge save:", err));
          const first = BADGES.find(b => b.id === fresh[0]);
          showToast(fresh.length === 1 ? `Badge earned: ${first.emoji} ${first.name}!` : `🏆 ${fresh.length} new badges earned!`);
        }
      })
      .catch(e => console.error("MobileApp data load:", e));

    return () => { cancelled = true; };
  }, [athleteId, tick]);

  const firstName = (profile?.name || "Athlete").split(" ")[0];
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const kicker = screen === "home" ? `${weekday} · let's play` : SCREENS[screen].kicker;
  const title = screen === "home" ? `Hi, ${firstName}!` : screen === "me" ? firstName
    : screen.charAt(0).toUpperCase() + screen.slice(1);
  const todayWb = mergeWellbeingByDate(wellbeing)[toLocalDateStr(new Date())];

  const onSaved = (msg) => { showToast(msg); refresh(); };

  // Lean alert derivation from already-loaded data; dismissals stick per device.
  const [dismissedAlerts, setDismissedAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dismissedAlerts") || "[]"); } catch { return []; }
  });
  const dismissAlert = (id) => setDismissedAlerts(prev => {
    const next = [...prev, id];
    try { localStorage.setItem("dismissedAlerts", JSON.stringify(next.slice(-50))); } catch { /* ignore */ }
    return next;
  });
  const todayStr = toLocalDateStr(new Date());
  const alerts = [];
  {
    const { acwr } = computeLoad(weekLogs);
    const st = acwrStatus(acwr);
    if (st.tone === "danger" || st.tone === "warn") {
      alerts.push({
        id: `load-${st.tone}-${todayStr}`, tone: st.tone, title: "Training load is high",
        body: st.tone === "danger" ? "ACWR is in the danger zone — make today a recovery day." : "Ease off intensity for a day or two.",
      });
    }
    const nearestT = nearestUpcoming(tournaments, todayStr);
    if (nearestT) {
      const d = daysUntil(nearestT.date, todayStr);
      if (d <= 14) alerts.push({
        id: `tourney-${nearestT.id}-${d <= 7 ? "wk" : "2wk"}`, tone: "info",
        title: d === 0 ? "Tournament today! 🏟️" : `Tournament in ${d} day${d === 1 ? "" : "s"}`,
        body: `${nearestT.name} — Sunday plans taper automatically.`,
      });
    }
    priorities.filter(p => p.status === "escalated").forEach(p => alerts.push({
      id: `esc-${p.id}`, tone: "danger", title: "Priority needs attention",
      body: `"${p.priority}" has been waiting ${p.weeksDeferredCount ?? "several"} weeks.`,
    }));
    technical
      .filter(t => t.reviewDueDate && t.reviewDueDate <= todayStr && t.status === "active")
      .slice(0, 2)
      .forEach(t => alerts.push({
        id: `rev-${t.id}`, tone: "info", title: `🎥 Review due: ${t.strokeArea}`,
        body: `Scheduled stroke review reached (${t.reviewDueDate}).`,
      }));
  }
  const activeAlerts = alerts.filter(a => !dismissedAlerts.includes(a.id));

  return (
    <div style={{ minHeight: "100vh", background: M.pageBg }}>
      <style>{mobileCss}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "22px 16px 110px" }}>
        <Header
          kicker={kicker}
          title={title}
          streak={streakInfo.current}
          initial={firstName.charAt(0).toUpperCase() || "A"}
          onAvatar={() => setScreen("me")}
        />
        <div key={screen} style={{ animation: "screenIn .25s ease" }}>
          {screen === "home" ? (
            <HomeScreen
              weekLogs={weekLogs}
              wellbeing={wellbeing}
              xp={xp}
              activeThisWeek={streakInfo.activeThisWeek}
              streak={streakInfo.current}
              onOpenCheckin={() => setSheet("checkin")}
              earnedBadges={earnedBadges}
              onOpenBadge={(b) => setBadgeSheet(b)}
              alerts={activeAlerts}
              onDismissAlert={dismissAlert}
            />
          ) : screen === "load" ? (
            <LoadScreen weekLogs={weekLogs} />
          ) : screen === "matches" ? (
            <MatchesScreen
              matches={matches}
              tournaments={tournaments}
              seasonReport={seasonReport}
              seasonLoading={seasonLoading}
              onOpenMatch={openMatch}
              onOpenImport={() => setSheet("import")}
              onAddTournament={() => setSheet("tournament")}
              onGenerateSeason={generateSeason}
            />
          ) : screen === "plan" ? (
            <PlanScreen
              plan={planResult}
              tournaments={tournaments}
              loading={planLoading}
              doneMap={planResult?.doneMap}
              onGenerate={generatePlan}
              onToggleExercise={toggleExercise}
              onFinishSession={finishSession}
              onRegenerate={() => { setPlanResult(null); }}
            />
          ) : screen === "me" ? (
            <MeScreen
              profile={profile}
              xp={xp}
              streak={streakInfo.current}
              sessionHistory={sessionHistory}
              priorities={priorities}
              benchmarks={benchmarks}
              technical={technical}
              isParent={isParent}
              parentMode={parentMode}
              onToggleParentMode={toggleParentMode}
              onToggleGap={toggleGap}
              onResolvePriority={resolvePriority}
              onLogGrowth={() => profile ? setSheet("growth") : showToast("Still loading — try again in a moment ⏳")}
              onLogBenchmark={() => setSheet("benchmark")}
              onLogStroke={() => setSheet("stroke")}
              onEditProfile={() => profile ? setSheet("profile") : showToast("Still loading — try again in a moment ⏳")}
              onSignOut={onSignOut}
            />
          ) : null}
        </div>
      </div>

      <BottomNav active={screen} onNav={setScreen} onFab={() => setSheet("log")} />

      <BottomSheet open={sheet === "log"} onClose={() => setSheet(null)}>
        <LogSheet athleteId={athleteId} onSaved={onSaved} onMotivate={showToast} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "checkin"} onClose={() => setSheet(null)}>
        <CheckinSheet athleteId={athleteId} initial={todayWb} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={detailMatch != null} onClose={closeMatch}>
        <MatchDetailSheet
          match={detailMatch}
          analysis={analysis}
          analysisLoading={analysisLoading}
          generating={analysisGenerating}
          onGenerate={generateAnalysis}
          onDelete={isParent ? deleteMatch : null}
        />
      </BottomSheet>
      <BottomSheet open={sheet === "tournament"} onClose={() => setSheet(null)}>
        <TournamentSheet athleteId={athleteId} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "import"} onClose={() => setSheet(null)}>
        <ImportSheet athleteId={athleteId} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "growth"} onClose={() => setSheet(null)}>
        <GrowthSheet athleteId={athleteId} measurements={profile?.measurements || []} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "benchmark"} onClose={() => setSheet(null)}>
        <BenchmarkSheet athleteId={athleteId} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "stroke"} onClose={() => setSheet(null)}>
        <StrokeSheet athleteId={athleteId} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "profile"} onClose={() => setSheet(null)}>
        <ProfileSheet athleteId={athleteId} profile={profile} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={badgeSheet != null} onClose={() => setBadgeSheet(null)}>
        <BadgeSheet badge={badgeSheet} earnedDate={badgeSheet ? earnedBadges[badgeSheet.id] : null} />
      </BottomSheet>

      <Toast message={toast} />
    </div>
  );
}
