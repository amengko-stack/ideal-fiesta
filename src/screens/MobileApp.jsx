import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs, query, where, orderBy, limit, documentId, doc, getDoc, setDoc, addDoc, deleteDoc } from "firebase/firestore";
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
import LiveMatchScreen from "./LiveMatchScreen.jsx";
import PlanScreen from "./PlanScreen.jsx";
import MeScreen from "./MeScreen.jsx";
import BadgeSheet from "./BadgeSheet.jsx";
import GrowthSheet from "./GrowthSheet.jsx";
import BenchmarkSheet from "./BenchmarkSheet.jsx";
import StrokeSheet from "./StrokeSheet.jsx";
import ProfileSheet from "./ProfileSheet.jsx";
import InjurySheet from "./InjurySheet.jsx";
import { computeAge, chronologicalCategory } from "../lib/athleteIdentity.js";
import { mergeWellbeingByDate } from "../lib/load.js";
import { generateSeasonReport } from "../lib/seasonReport.js";
import { friendlyAiError } from "../lib/aiErrors.js";
import { generateMatchAnalysis } from "../lib/matchAnalysis.js";
import { generateSundayPlan } from "../lib/planGen.js";
import { awardXp } from "../lib/gamificationStore.js";
import { XP, levelFromXp, xpForSession } from "../lib/gamification.js";
import { sessionSRPE } from "../lib/load.js";
import { finalizeMatch } from "../lib/liveScoring.js";
import { BADGES, evaluateBadges } from "../lib/badges.js";
import { resolveDeferred, mergeDuplicatePriorities, resolveMetricTargets } from "../lib/deferredPriorities.js";
import { emptyMemory, deleteMemoryPattern } from "../lib/athleteMemory.js";
import { dueReminders } from "../lib/reminders.js";
import { supersededReminderKinds } from "../lib/guardianCore.js";
import { isPushSupported, pushPermission, enablePush, disablePush, refreshPushToken, onForegroundMessage } from "../lib/push.js";
import { runWeeklyReviewNow, runGuardianNow } from "../lib/orchestrator.js";

// Why enabling reminders failed, in words the family can act on. Keyed by the
// `reason` push.js returns instead of throwing.
const PUSH_FAILURE = {
  "dev-mode":         "Reminders only work in the installed app 📲",
  "unsupported":      "This device can't do reminders yet 🙈",
  "missing-vapid-key": "Push isn't set up yet — missing its key 🔑",
  "denied":           "Notifications are blocked — turn them back on in your browser settings",
  "dismissed":        "No worries — tap again if you change your mind",
  "no-token":         "Couldn't register this device — try again 🙈",
  "gesture-lost":     "Tap the toggle again — the browser needs a fresh tap to ask 👆",
  "error":            "Couldn't turn reminders on — try again 🙈",
};

const SCREENS = {
  home:    { kicker: null,              label: "Home",    emoji: "🏠" },
  load:    { kicker: "Training load",   label: "Load",    emoji: "📊" },
  matches: { kicker: "Season so far",   label: "Matches", emoji: "🎾" },
  plan:    { kicker: "Your plan",       label: "Plan",    emoji: "📋" },
  me:      { kicker: "Profile & tools", label: "Profile", emoji: "⭐" },
};

export default function MobileApp({ athleteId, isParent, user, onSignOut }) {
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
  // Why the last AI generation failed, kept on the card because a toast is
  // gone before anyone can read or report it.
  const [seasonError, setSeasonError] = useState(null);
  const [planError, setPlanError] = useState(null);
  const [sheet, setSheet]       = useState(null); // null | "log" | "checkin" | "tournament" | "import"
  const [injuryTarget, setInjuryTarget] = useState(null); // open injury being edited, or null for a fresh log
  const [earnedBadges, setEarnedBadges] = useState({});
  const [badgeSheet, setBadgeSheet] = useState(null); // null | BADGES entry
  const [toast, setToast]       = useState(null);
  const [tick, setTick]         = useState(0);
  const [priorities, setPriorities] = useState([]);
  const [benchmarks, setBenchmarks] = useState([]);
  const [technical, setTechnical] = useState([]);
  const [injuries, setInjuries] = useState([]);
  const [memory, setMemory] = useState(emptyMemory());
  // Newest weekly-review digest, or null. HomeScreen decides whether it is
  // still fresh enough to show (dates.isDigestFresh).
  const [digest, setDigest] = useState(null);
  const [weeklyReviewRunning, setWeeklyReviewRunning] = useState(false);
  // Newest guardian alert, or null. HomeScreen decides whether it is still
  // showable (un-dismissed, un-resolved, matching engine version).
  const [guardianAlert, setGuardianAlert] = useState(null);
  const [guardianRunning, setGuardianRunning] = useState(false);
  const [parentMode, setParentMode] = useState(() => {
    try { return localStorage.getItem("parentMode") !== "0"; } catch { return true; }
  });
  // Push reminders. `supported` stays false until isPushSupported() resolves,
  // so the settings row reads "unavailable" rather than flashing an enabled
  // toggle on a device that can never receive a notification. The on/off flag
  // itself is not duplicated here — it lives on the athlete doc (the scheduled
  // function has to read it), so it is composed from `profile` at render time.
  const [pushState, setPushState] = useState({ supported: false, permission: "unsupported" });
  const toastTimer = useRef(null);

  const [liveOpen, setLiveOpen] = useState(false);   // live scoring overlay
  const [liveResume, setLiveResume] = useState(null); // engine state to resume, or null for a fresh match
  const [liveDraft, setLiveDraft] = useState(null);   // persisted in-progress match, if any

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
      if (detailMatchIdRef.current === forId) showToast(`Couldn't analyse — ${friendlyAiError(e)}`);
    } finally {
      setAnalysisGenerating(false);
    }
  };

  const startLive = () => { setLiveResume(null); setLiveOpen(true); };
  const resumeLive = () => {
    if (!liveDraft) return;
    setLiveResume({ config: liveDraft.config, log: liveDraft.log || [] });
    setLiveOpen(true);
  };
  const discardLive = () => {
    deleteDoc(doc(db, "athletes", athleteId, "liveMatches", "current"))
      .catch(e => console.error("live draft delete:", e));
    setLiveDraft(null);
    setLiveOpen(false);
    showToast("Live match discarded 🗑️");
  };

  const finishLive = (state, { durationMin, rpe }) => {
    const matchData = finalizeMatch(state, { durationMin });
    if (matchData.ageCategory == null) {
      matchData.ageCategory = profile?.competitionCategory
        || chronologicalCategory(computeAge(profile?.dob))
        || "U12";
    }
    setDoc(doc(db, "matches", matchData.matchId), {
      ...matchData, athleteId, importedAt: new Date().toISOString(),
    }).catch(e => console.error("live match save:", e));

    // Feed the training-load tracker — same entry shape LogSheet writes.
    const started = new Date(state.config.startedAt);
    const entry = {
      type: "match", duration: durationMin, rpe,
      date: toLocalDateStr(started), time: started.toTimeString().slice(0, 5),
      result: matchData.whoWonMatch === 1 ? "W" : "L",
    };
    addDoc(collection(db, "athletes", athleteId, "weekLogs"), entry)
      .catch(e => console.error("live match weekLog:", e));
    awardXp(athleteId, xpForSession(sessionSRPE(entry)))
      .catch(e => console.error("live match xp:", e));

    deleteDoc(doc(db, "athletes", athleteId, "liveMatches", "current"))
      .catch(e => console.error("live draft delete:", e));
    setLiveDraft(null);
    setLiveOpen(false);
    onSaved(`Match vs ${matchData.opponentName} saved! 🎾`);
    openMatch({ id: matchData.matchId, ...matchData, athleteId });
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
    setSeasonError(null);
    try {
      const report = await generateSeasonReport(athleteId, matches);
      setSeasonReport(report);
      showToast("Season analysis ready 🧠");
    } catch (e) {
      console.error("Season generation:", e);
      // Toasts vanish; the card keeps the reason around long enough to read
      // and report it.
      const reason = friendlyAiError(e);
      setSeasonError(reason);
      showToast(`Couldn't generate — ${reason}`);
    } finally {
      setSeasonLoading(false);
    }
  };

  const generatePlan = async (mode) => {
    if (planLoading) return;
    setPlanLoading(true);
    setPlanError(null);
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
      const reason = friendlyAiError(e);
      setPlanError(reason);
      showToast(`Couldn't build the plan — ${reason}`);
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

  const removeMemoryPattern = async (pattern) => {
    try {
      await deleteMemoryPattern(athleteId, pattern);
      setMemory(prev => ({ ...prev, persistentPatterns: (prev.persistentPatterns || []).filter(p => p.pattern !== pattern) }));
      showToast("Removed 🗑️");
    } catch (e) {
      console.error("removeMemoryPattern:", e);
      showToast("Couldn't remove — try again 🙈");
    }
  };

  // Turning reminders on can fail for five distinct reasons and the difference
  // matters — "blocked in Safari" needs a different action from "not installed".
  const toggleReminders = async () => {
    const role = isParent ? "parent" : "athlete";
    // Belt and braces: push.js returns reasons rather than throwing, but a
    // toggle that silently does nothing is the worst outcome here, so anything
    // that does escape still gets a toast.
    try {
      if (profile?.remindersEnabled) {
        await disablePush({ athleteId });
        setPushState(s => ({ ...s, permission: pushPermission() }));
        setProfile(p => (p ? { ...p, remindersEnabled: false } : p));
        showToast("Evening reminders off");
        return;
      }
      const result = await enablePush({ athleteId, uid: user?.uid, role });
      setPushState(s => ({ ...s, permission: pushPermission() }));
      if (result?.ok) {
        setProfile(p => (p ? { ...p, remindersEnabled: true } : p));
        showToast("Reminders on — I'll nudge you each evening ✨");
      } else {
        showToast(PUSH_FAILURE[result?.reason] || PUSH_FAILURE.error);
      }
    } catch (e) {
      console.error("toggleReminders:", e);
      showToast(PUSH_FAILURE.error);
    }
  };

  // The Sunday orchestrator's opt-in flag lives on the athlete doc because the
  // scheduled function is what reads it — same reasoning (and same merge-set) as
  // remindersEnabled in push.js.
  const toggleWeeklyReview = () => {
    setProfile(prev => {
      if (!prev) return prev;
      const next = !prev.weeklyReviewEnabled;
      setDoc(doc(db, "athletes", athleteId), { weeklyReviewEnabled: next }, { merge: true })
        .catch(err => console.error("weeklyReviewEnabled save:", err));
      showToast(next ? "Weekly review on — every Sunday morning 🗞️" : "Weekly review off");
      return { ...prev, weeklyReviewEnabled: next };
    });
  };

  // The full pipeline takes a couple of minutes; the running flag both blocks a
  // double-tap and gives the button something honest to say meanwhile.
  const runWeeklyReview = async () => {
    if (weeklyReviewRunning) return;
    setWeeklyReviewRunning(true);
    try {
      await runWeeklyReviewNow(athleteId);
      showToast("Weekly review complete 🗞️");
      refresh();
    } catch (e) {
      console.error("runWeeklyReview:", e);
      // orchestrator.js has already turned the callable error into a sentence.
      showToast(`Couldn't run the review — ${e.message}`);
    } finally {
      setWeeklyReviewRunning(false);
    }
  };

  // The guardian's opt-in flag, same merge-set and same reasoning as
  // weeklyReviewEnabled: the scheduled function is what reads it.
  const toggleGuardian = () => {
    setProfile(prev => {
      if (!prev) return prev;
      const next = !prev.guardianEnabled;
      setDoc(doc(db, "athletes", athleteId), { guardianEnabled: next }, { merge: true })
        .catch(err => console.error("guardianEnabled save:", err));
      showToast(next ? "Guardian on — a quiet check every morning 🛡️" : "Guardian off");
      return { ...prev, guardianEnabled: next };
    });
  };

  // One LLM call at most, so this is faster than the weekly review — but the
  // running flag still blocks a double-tap and gives the button something
  // honest to say meanwhile.
  const runGuardian = async () => {
    if (guardianRunning) return;
    setGuardianRunning(true);
    try {
      await runGuardianNow(athleteId);
      showToast("Guardian check complete 🛡️");
      refresh();
    } catch (e) {
      console.error("runGuardian:", e);
      // orchestrator.js has already turned the callable error into a sentence.
      showToast(`Couldn't run the check — ${e.message}`);
    } finally {
      setGuardianRunning(false);
    }
  };

  // Dismissal lives on the alert doc, not localStorage, because it has to hold
  // across the family's three devices. Optimistic locally, fire-and-forget
  // remotely — a failed write costs a re-appearing card, not data.
  const dismissGuardianAlert = (alertId) => {
    setGuardianAlert(prev => (prev ? { ...prev, dismissedAt: new Date().toISOString() } : prev));
    setDoc(doc(db, "athletes", athleteId, "guardianAlerts", alertId), {
      dismissedAt: new Date().toISOString(),
      dismissedBy: isParent && parentMode ? "parent" : "athlete",
    }, { merge: true }).catch(console.error);
  };

  const toggleParentMode = () => {
    setParentMode(p => {
      const next = !p;
      try { localStorage.setItem("parentMode", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const refresh = useCallback(() => setTick(t => t + 1), []);

  // Stable identity so effects can depend on it honestly.
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Push setup, once per athlete/device. Re-minting the token on every open is
  // deliberate: iOS rotates tokens aggressively (especially after a PWA
  // reinstall), and the same call deletes a stored token when the OS permission
  // has since been revoked, so the athlete doc can't drift out of step with
  // what the device will actually accept.
  useEffect(() => {
    if (!athleteId || !user?.uid) return;
    let cancelled = false;
    let unsubscribe = null;
    const role = isParent ? "parent" : "athlete";
    (async () => {
      let supported;
      try { supported = await isPushSupported(); } catch { supported = false; }
      if (cancelled) return;
      setPushState({ supported, permission: supported ? pushPermission() : "unsupported" });
      if (!supported) return;
      refreshPushToken({ athleteId, uid: user.uid, role });
      try {
        // A push that lands while the app is open would otherwise be swallowed
        // by the browser, so surface it as a toast instead.
        unsubscribe = onForegroundMessage((payload) => {
          const text = payload?.notification?.body || payload?.notification?.title;
          if (text) showToast(text);
        });
      } catch (e) {
        console.error("push foreground subscribe:", e);
      }
    })();
    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [athleteId, user?.uid, isParent, showToast]);

  // Focus-priority housekeeping, once per athlete. Folds away the duplicate
  // rows left behind by the old exact-label matching, then closes any priority
  // whose match-stat target has been met. Both are no-ops once the list is
  // clean, so this settles after a single pass instead of looping on refresh.
  useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    (async () => {
      try {
        const folded   = await mergeDuplicatePriorities(athleteId);
        const resolved = await resolveMetricTargets(athleteId);
        if (cancelled || (folded === 0 && resolved.length === 0)) return;
        if (resolved.length > 0) {
          showToast(resolved.length === 1
            ? `"${resolved[0].priority}" hit its target — resolved 🎯`
            : `${resolved.length} priorities hit their targets — resolved 🎯`);
        }
        refresh();
      } catch (e) {
        console.error("focus priority housekeeping:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [athleteId, refresh, showToast]);

  useEffect(() => {
    let cancelled = false;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const cutoff = toLocalDateStr(cutoffDate);

    // weekLogs reaches back further than everything else: the Load screen's
    // 12-week ACWR chart asks computeLoadHistory for 12 weeks, which needs 15
    // week-buckets (~105 days) so the oldest visible week still has a full
    // 4-week chronic denominator. At 60 days those early weeks would read as
    // partial — an inflated ACWR, which is the one number here that must never
    // be wrong. Wellbeing and sessions stay at 60; nothing reads them deeper.
    const loadCutoffDate = new Date();
    loadCutoffDate.setDate(loadCutoffDate.getDate() - 126);
    const loadCutoff = toLocalDateStr(loadCutoffDate);

    // allSettled: one unreachable doc (e.g. first offline launch with a cold
    // cache) degrades that slice of the UI instead of blanking the whole app.
    Promise.allSettled([
      getDoc(doc(db, "athletes", athleteId)),
      getDocs(query(collection(db, "athletes", athleteId, "weekLogs"), where("date", ">=", loadCutoff))),
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
      getDoc(doc(db, "athletes", athleteId, "liveMatches", "current")),
      getDoc(doc(db, "athletes", athleteId, "memory", "current")),
      getDocs(collection(db, "athletes", athleteId, "injuries")),
      // Weekly digests are keyed by their Monday (YYYY-MM-DD), so document-id
      // order is chronological order — the newest one is a single-doc read.
      getDocs(query(collection(db, "athletes", athleteId, "digests"), orderBy(documentId(), "desc"), limit(1))),
      // Same trick: guardian alert ids are `{date}_{storyKey}` — date first, so
      // document-id order is chronological and the newest alert is one read.
      getDocs(query(collection(db, "athletes", athleteId, "guardianAlerts"), orderBy(documentId(), "desc"), limit(1))),
    ])
      .then((results) => {
        if (cancelled) return;
        const val = (i) => (results[i].status === "fulfilled" ? results[i].value : null);
        const failed = results.filter(r => r.status === "rejected");
        if (failed.length) console.error(`MobileApp data load: ${failed.length}/${results.length} reads failed`, failed[0].reason);
        const [profileSnap, logsSnap, wbSnap, sessSnap, xpSnap, matchesSnap, tournamentsSnap, seasonSnap, planSnap, prioritiesSnap, benchmarksSnap, technicalSnap, liveSnap, memorySnap, injuriesSnap, digestSnap, guardianSnap] =
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
        // Firestore returns these in document-id order, which is meaningless to
        // a parent — surface what needs attention first: escalated, then
        // longest-deferred.
        if (prioritiesSnap) setPriorities(
          prioritiesSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => p.status === "active" || p.status === "escalated")
            .sort((a, b) => {
              const esc = (b.status === "escalated") - (a.status === "escalated");
              if (esc !== 0) return esc;
              return (b.weeksDeferredCount ?? 0) - (a.weeksDeferredCount ?? 0);
            })
        );
        if (benchmarksSnap) setBenchmarks(benchmarksSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (technicalSnap) setTechnical(technicalSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (injuriesSnap) setInjuries(injuriesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (liveSnap) setLiveDraft(liveSnap.exists() ? liveSnap.data() : null);
        if (memorySnap) setMemory(memorySnap.exists() ? { ...emptyMemory(), ...memorySnap.data() } : emptyMemory());
        if (digestSnap) setDigest(digestSnap.docs[0] ? { id: digestSnap.docs[0].id, ...digestSnap.docs[0].data() } : null);
        if (guardianSnap) setGuardianAlert(guardianSnap.docs[0] ? { id: guardianSnap.docs[0].id, ...guardianSnap.docs[0].data() } : null);
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
    // showToast is a stable useCallback — listing it can't re-trigger the load.
  }, [athleteId, tick, showToast]);

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
  // Audience gate matches MeScreen's existing parent-only gating exactly:
  // isParent is the auth role, parentMode is the per-device display toggle
  // (so handing the phone to Valissa hides parent/medical alerts too).
  const canSeeParentAlerts = isParent && parentMode;
  // Supersession: when the guardian is telling one joined-up story, the
  // reminders that say a thinner version of the same thing are dropped rather
  // than stacked underneath it. supersededReminderKinds returns [] for a null,
  // dismissed, resolved or wrong-version alert, so this is a no-op most days.
  const alerts = dueReminders(
    { weekLogs, wellbeing, sessions: sessionHistory, tournaments, priorities, technical, benchmarks, injuries, plan: planResult, profile },
    new Date(),
    { suppressKinds: supersededReminderKinds(guardianAlert) }
  )
    .filter(r => r.audience === "both" || (r.audience === "athlete") || (r.audience === "parent" && canSeeParentAlerts))
    .map(({ id, tone, title, body }) => ({ id, tone, title, body }));
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
              injuries={injuries}
              xp={xp}
              activeThisWeek={streakInfo.activeThisWeek}
              streak={streakInfo.current}
              onOpenCheckin={() => setSheet("checkin")}
              earnedBadges={earnedBadges}
              onOpenBadge={(b) => setBadgeSheet(b)}
              alerts={activeAlerts}
              onDismissAlert={dismissAlert}
              priorities={priorities}
              digest={digest}
              guardianAlert={guardianAlert}
              onDismissGuardian={dismissGuardianAlert}
              showParentNotes={isParent && parentMode}
              onOpenPlan={() => setScreen("plan")}
            />
          ) : screen === "load" ? (
            <LoadScreen weekLogs={weekLogs} />
          ) : screen === "matches" ? (
            <MatchesScreen
              matches={matches}
              tournaments={tournaments}
              seasonReport={seasonReport}
              seasonLoading={seasonLoading}
              seasonError={seasonError}
              showParentNotes={isParent && parentMode}
              liveDraft={liveDraft}
              onStartLive={startLive}
              onResumeLive={resumeLive}
              onDiscardLive={discardLive}
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
              error={planError}
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
              weekLogs={weekLogs}
              priorities={priorities}
              matches={matches}
              benchmarks={benchmarks}
              technical={technical}
              injuries={injuries}
              memory={memory}
              onRemoveMemoryPattern={removeMemoryPattern}
              pushState={{ ...pushState, enabled: !!profile?.remindersEnabled }}
              onToggleReminders={toggleReminders}
              weeklyReviewEnabled={!!profile?.weeklyReviewEnabled}
              weeklyReviewRunning={weeklyReviewRunning}
              onToggleWeeklyReview={toggleWeeklyReview}
              onRunWeeklyReview={runWeeklyReview}
              guardianEnabled={!!profile?.guardianEnabled}
              guardianRunning={guardianRunning}
              onToggleGuardian={toggleGuardian}
              onRunGuardian={runGuardian}
              isParent={isParent}
              parentMode={parentMode}
              onToggleParentMode={toggleParentMode}
              onToggleGap={toggleGap}
              onResolvePriority={resolvePriority}
              onLogGrowth={() => profile ? setSheet("growth") : showToast("Still loading — try again in a moment ⏳")}
              onLogBenchmark={() => setSheet("benchmark")}
              onLogStroke={() => setSheet("stroke")}
              onLogInjury={() => { setInjuryTarget(null); setSheet("injury"); }}
              onEditInjury={(inj) => { setInjuryTarget(inj); setSheet("injury"); }}
              onEditProfile={() => profile ? setSheet("profile") : showToast("Still loading — try again in a moment ⏳")}
              onSignOut={onSignOut}
            />
          ) : null}
        </div>
      </div>

      <BottomNav active={screen} onNav={setScreen} onFab={() => setSheet("log")} />

      {liveOpen && (
        <LiveMatchScreen
          athleteId={athleteId}
          athleteName={firstName}
          profile={profile}
          resume={liveResume}
          onFinish={finishLive}
          onDiscard={discardLive}
          onClose={() => { setLiveOpen(false); refresh(); }}
        />
      )}

      <BottomSheet open={sheet === "log"} onClose={() => setSheet(null)}>
        <LogSheet athleteId={athleteId} profile={profile} priorities={priorities} onSaved={onSaved} onMotivate={showToast} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "checkin"} onClose={() => setSheet(null)}>
        <CheckinSheet athleteId={athleteId} initial={todayWb} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={detailMatch != null} onClose={closeMatch}>
        <MatchDetailSheet
          match={detailMatch}
          analysis={analysis}
          showParentNotes={isParent && parentMode}
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
        <ImportSheet athleteId={athleteId} profile={profile} onSaved={onSaved} onClose={() => setSheet(null)} />
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
      <BottomSheet open={sheet === "injury"} onClose={() => setSheet(null)}>
        <InjurySheet athleteId={athleteId} editing={injuryTarget} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={badgeSheet != null} onClose={() => setBadgeSheet(null)}>
        <BadgeSheet badge={badgeSheet} earnedDate={badgeSheet ? earnedBadges[badgeSheet.id] : null} />
      </BottomSheet>

      <Toast message={toast} />
    </div>
  );
}
