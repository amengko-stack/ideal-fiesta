import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M, mobileCss } from "../styles/mobileTheme.js";
import { computeStreak } from "../lib/streak.js";
import { toLocalDateStr } from "../lib/dates.js";
import Header from "../ui/Header.jsx";
import BottomNav from "../ui/BottomNav.jsx";
import BottomSheet from "../ui/BottomSheet.jsx";
import Toast from "../ui/Toast.jsx";
import PlaceholderScreen from "./PlaceholderScreen.jsx";
import HomeScreen from "./HomeScreen.jsx";
import LoadScreen from "./LoadScreen.jsx";
import LogSheet from "./LogSheet.jsx";
import CheckinSheet from "./CheckinSheet.jsx";
import MatchesScreen from "./MatchesScreen.jsx";
import MatchDetailSheet from "./MatchDetailSheet.jsx";
import TournamentSheet from "./TournamentSheet.jsx";
import ImportSheet from "./ImportSheet.jsx";
import { mergeWellbeingByDate } from "../lib/load.js";
import { generateSeasonReport } from "../lib/seasonReport.js";

const SCREENS = {
  home:    { kicker: null,              label: "Home",    emoji: "🏠" },
  load:    { kicker: "Training load",   label: "Load",    emoji: "📊" },
  matches: { kicker: "Season so far",   label: "Matches", emoji: "🎾" },
  plan:    { kicker: "Your plan",       label: "Plan",    emoji: "📋", note: "Your Sunday session, tuned to your week — coming soon." },
  me:      { kicker: "Profile & tools", label: "Profile", emoji: "⭐", note: "Profile, focus areas and coach tools — coming soon." },
};

export default function MobileApp({ athleteId }) {
  const [screen, setScreen]     = useState("home");
  const [name, setName]         = useState("");
  const [weekLogs, setWeekLogs] = useState([]);
  const [wellbeing, setWellbeing] = useState([]);
  const [xp, setXp]             = useState(0);
  const [streakInfo, setStreakInfo] = useState({ current: 0, activeThisWeek: 0 });
  const [matches, setMatches]   = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [seasonReport, setSeasonReport] = useState(null);
  const [sheet, setSheet]       = useState(null); // null | "log" | "checkin" | "tournament" | "import"
  const [toast, setToast]       = useState(null);
  const [tick, setTick]         = useState(0);
  const toastTimer = useRef(null);

  const [detailMatch, setDetailMatch] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [seasonLoading, setSeasonLoading] = useState(false);

  const openMatch = (m) => {
    setDetailMatch(m);
    setAnalysis(null);
    setAnalysisLoading(true);
    getDoc(doc(db, "athletes", athleteId, "matchAnalyses", String(m.matchId || m.id)))
      .then(snap => setAnalysis(snap.exists() ? snap.data() : null))
      .catch(() => setAnalysis(null))
      .finally(() => setAnalysisLoading(false));
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

    Promise.all([
      getDoc(doc(db, "athletes", athleteId)),
      getDocs(query(collection(db, "athletes", athleteId, "weekLogs"), where("date", ">=", cutoff))),
      getDocs(query(collection(db, "athletes", athleteId, "wellbeing"), where("date", ">=", cutoff))),
      getDocs(query(collection(db, "athletes", athleteId, "sessions"), where("date", ">=", cutoff))),
      getDoc(doc(db, "athletes", athleteId, "gamification", "state")),
      getDocs(collection(db, "matches")),
      getDocs(collection(db, "athletes", athleteId, "tournaments")),
      getDoc(doc(db, "athletes", athleteId, "reports", "seasonLatest")),
    ])
      .then(([profileSnap, logsSnap, wbSnap, sessSnap, xpSnap, matchesSnap, tournamentsSnap, seasonSnap]) => {
        if (cancelled) return;
        if (profileSnap.exists()) setName(profileSnap.data().name || "");
        const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const wb   = wbSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setWeekLogs(logs);
        setWellbeing(wb);
        setXp(xpSnap.exists() ? xpSnap.data().xp || 0 : 0);
        setMatches(matchesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTournaments(tournamentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setSeasonReport(seasonSnap.exists() ? seasonSnap.data() : null);
        const dates = [
          ...logs.map(l => l.date),
          ...wb.map(w => w.date),
          ...sessSnap.docs.map(d => d.data().date),
        ].filter(Boolean);
        setStreakInfo(computeStreak(dates, toLocalDateStr(new Date())));
      })
      .catch(e => console.error("MobileApp data load:", e));

    return () => { cancelled = true; };
  }, [athleteId, tick]);

  const firstName = (name || "Athlete").split(" ")[0];
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const kicker = screen === "home" ? `${weekday} · let's play` : SCREENS[screen].kicker;
  const title = screen === "home" ? `Hi, ${firstName}!` : screen === "me" ? firstName
    : screen.charAt(0).toUpperCase() + screen.slice(1);
  const sc = SCREENS[screen];
  const todayWb = mergeWellbeingByDate(wellbeing)[toLocalDateStr(new Date())];

  const onSaved = (msg) => { showToast(msg); refresh(); };

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
          ) : (
            <PlaceholderScreen emoji={sc.emoji} title={`${sc.label} is on its way`} note={sc.note} />
          )}
        </div>
      </div>

      <BottomNav active={screen} onNav={setScreen} onFab={() => setSheet("log")} />

      <BottomSheet open={sheet === "log"} onClose={() => setSheet(null)}>
        <LogSheet athleteId={athleteId} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "checkin"} onClose={() => setSheet(null)}>
        <CheckinSheet athleteId={athleteId} initial={todayWb} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={detailMatch != null} onClose={() => setDetailMatch(null)}>
        <MatchDetailSheet match={detailMatch} analysis={analysis} analysisLoading={analysisLoading} />
      </BottomSheet>
      <BottomSheet open={sheet === "tournament"} onClose={() => setSheet(null)}>
        <TournamentSheet athleteId={athleteId} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "import"} onClose={() => setSheet(null)}>
        <ImportSheet athleteId={athleteId} onSaved={onSaved} onClose={() => setSheet(null)} />
      </BottomSheet>

      <Toast message={toast} />
    </div>
  );
}
