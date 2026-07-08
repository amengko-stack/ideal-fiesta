import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Target, ClipboardList, Dumbbell, History, ClipboardCheck, TrendingUp, FileText, Settings } from "lucide-react";
import { doc, getDoc, setDoc, addDoc, deleteDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { COLORS, css } from "../styles/theme.js";
import AlertsBanner from "../components/AlertsBanner.jsx";

const PlanTab        = lazy(() => import("./PlanTab.jsx"));
const LogTab         = lazy(() => import("./LogTab.jsx"));
const StrengthLogTab = lazy(() => import("./StrengthLogTab.jsx"));
const MatchesTab     = lazy(() => import("./MatchesTab.jsx"));
const PrioritiesTab  = lazy(() => import("./PrioritiesTab.jsx"));
const BenchmarksTab  = lazy(() => import("./BenchmarksTab.jsx"));
const TechnicalTab   = lazy(() => import("./TechnicalTab.jsx"));
const ProfileTab     = lazy(() => import("./ProfileTab.jsx"));

// ─── ATHLETE MAIN ─────────────────────────────────────────────────────────────
export default function AthleteMain({ athleteId, isParent, user, onBack, onSignOut }) {
  const [tab, setTab]                     = useState("plan");
  const [profile, setProfile]             = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [weekLogs, setWeekLogs]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [planResult, setPlanResult]       = useState(null);
  const [aiLoading, setAiLoading]         = useState(false);
  const [wellbeing, setWellbeing]         = useState([]);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      try {
        const [profileSnap, logsSnap, sessSnap, wellSnap, planSnap] = await Promise.all([
          getDoc(doc(db, "athletes", athleteId)),
          getDocs(collection(db, "athletes", athleteId, "weekLogs")),
          getDocs(query(
            collection(db, "athletes", athleteId, "sessions"),
            orderBy("date", "desc")
          )),
          getDocs(query(
            collection(db, "athletes", athleteId, "wellbeing"),
            orderBy("date", "desc"), limit(28)
          )),
          getDoc(doc(db, "athletes", athleteId, "plans", "current")),
        ]);
        if (profileSnap.exists()) setProfile(profileSnap.data());
        setWeekLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setSessionHistory(sessSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setWellbeing(wellSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (planSnap.exists()) {
          setPlanResult(planSnap.data());
        }
      } catch (e) {
        console.error("Load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [athleteId]);

  const saveProfile = useCallback(async (p) => {
    setProfile(p);
    await setDoc(doc(db, "athletes", athleteId), p, { merge: true });
  }, [athleteId]);

  const addWeekLog = useCallback(async (logData) => {
    const ref = await addDoc(collection(db, "athletes", athleteId, "weekLogs"), logData);
    setWeekLogs(prev => [...prev, { id: ref.id, ...logData }]);
  }, [athleteId]);

  const deleteWeekLog = useCallback(async (logId) => {
    await deleteDoc(doc(db, "athletes", athleteId, "weekLogs", logId));
    setWeekLogs(prev => prev.filter(l => l.id !== logId));
  }, [athleteId]);

  const addSession = useCallback(async (sessionData) => {
    const ref = await addDoc(collection(db, "athletes", athleteId, "sessions"), sessionData);
    setSessionHistory(prev => [{ id: ref.id, ...sessionData }, ...prev]);
  }, [athleteId]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: COLORS.bg }}>
        <style>{css}</style>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div className="flex-between" style={{ alignItems: "center" }}>
            <h1>Performance Tracker</h1>
            <div style={{ display: "flex", gap: 8 }}>
              {onBack && (
                <button className="btn btn-ghost btn-sm" onClick={onBack}>← Athletes</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { label: profile?.name || "Athlete",   color: COLORS.accent,  bg: COLORS.accentMuted },
              { label: "Age 12",                     color: COLORS.muted,   bg: COLORS.surface },
              { label: "Tennis",                     color: COLORS.tennis,  bg: "rgba(200,245,100,0.1)" },
              { label: "Cheer",                      color: COLORS.cheer,   bg: "rgba(245,100,200,0.1)" },
              ...(isParent ? [{ label: "Parent View", color: COLORS.yellow, bg: "rgba(245,197,24,0.12)" }] : []),
            ].map(chip => (
              <span key={chip.label} style={{
                fontSize: "0.68rem", fontWeight: 600, padding: "2px 8px",
                borderRadius: 20, color: chip.color, background: chip.bg,
                whiteSpace: "nowrap",
              }}>{chip.label}</span>
            ))}
          </div>
        </div>

        {isParent && !loading && (
          <AlertsBanner
            athleteId={athleteId}
            wellbeing={wellbeing}
            sessionHistory={sessionHistory}
            weekLogs={weekLogs}
          />
        )}

        <div className="tabs">
          {[
            { id: "plan",     Icon: Target,        label: "Sunday Plan" },
            { id: "log",      Icon: ClipboardList, label: "Log Activity" },
            { id: "strength", Icon: Dumbbell,      label: "Log Strength" },
            { id: "matches",    Icon: History,        label: "Matches" },
            { id: "priorities", Icon: ClipboardCheck, label: "Priorities" },
            ...(isParent ? [
              { id: "benchmarks", Icon: TrendingUp, label: "Benchmarks" },
              { id: "technical",  Icon: FileText,   label: "Technical"  },
            ] : []),
            { id: "profile",    Icon: Settings,       label: "Profile" },
          ].map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <t.Icon size={14} strokeWidth={2} style={{ flexShrink: 0 }} />{t.label}
            </button>
          ))}
        </div>

        <Suspense fallback={<div className="empty">Loading…</div>}>
          {tab === "plan"     && <PlanTab athleteId={athleteId} profile={profile} weekLogs={weekLogs} sessionHistory={sessionHistory} wellbeing={wellbeing} aiLoading={aiLoading} setAiLoading={setAiLoading} planResult={planResult} setPlanResult={setPlanResult} />}
          {tab === "log"      && <LogTab weekLogs={weekLogs} addWeekLog={addWeekLog} deleteWeekLog={deleteWeekLog} />}
          {tab === "strength" && <StrengthLogTab sessionHistory={sessionHistory} addSession={addSession} planResult={planResult} />}
          {tab === "matches"     && <MatchesTab     athleteId={athleteId} />}
          {tab === "priorities"  && <PrioritiesTab  athleteId={athleteId} />}
          {tab === "benchmarks"  && isParent && <BenchmarksTab athleteId={athleteId} profile={profile} />}
          {tab === "technical"   && isParent && <TechnicalTab  athleteId={athleteId} />}
          {tab === "profile"     && <ProfileTab     profile={profile} saveProfile={saveProfile} />}
        </Suspense>
      </div>
    </>
  );
}
