import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, BarChart2, ChevronLeft, ClipboardCheck, ClipboardList,
  Dumbbell, FileText, Heart, History, MessageSquare, Moon,
  Settings, Sprout, Sun, Target, Trash2, TrendingUp,
  UserPlus, Users, Zap,
} from "lucide-react";
import { auth, db } from "./firebase";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, addDoc, deleteDoc,
  collection, getDocs, query, orderBy, limit,
} from "firebase/firestore";
import { buildAthleteContext } from "./lib/athleteContext.js";
import { saveDeferredPriorities, refreshEscalations, resolveDeferred } from "./lib/deferredPriorities.js";
import { toLocalDateStr } from "./lib/dates.js";
import { sessionSRPE, computeLoad, mergeWellbeingByDate, calculateMetrics } from "./lib/load.js";
import { COLORS, css } from "./styles/theme.js";
import { parsePlist, extractMatchData } from "./lib/plist.js";
import { callClaudeJSON, callClaudeText } from "./lib/ai.js";
import AthleteView from "./athlete/AthleteView.jsx";
import PlanTab from "./tabs/PlanTab.jsx";
import LogTab from "./tabs/LogTab.jsx";
import StrengthLogTab from "./tabs/StrengthLogTab.jsx";
import ProfileTab from "./tabs/ProfileTab.jsx";

const ALLOWED_USERS = {
  'jFXQ9SamJ6QnIpaam5dLedKcFkA2': { role: 'parent',  athleteId: 'kDybMQH9lefwHI0dRway' },
  '2Hxj2FUJP4YQSvnsR2fkStu0uoC2': { role: 'parent',  athleteId: 'kDybMQH9lefwHI0dRway' },
  'qmj32jhoYnQ9OJCQCXM1soIhHPx2': { role: 'athlete', athleteId: 'kDybMQH9lefwHI0dRway' },
};



// ─── AUTH ROUTER ─────────────────────────────────────────────────────────────
export default function App() {
  const [authState, setAuthState]         = useState("loading");
  const [user, setUser]                   = useState(null);
  const [athleteId, setAthleteId]         = useState(null);
  const [viewingAthleteId, setViewingId]  = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setAuthState("unauthenticated");
        return;
      }
      setUser(u);
      const userConfig = ALLOWED_USERS[u.uid];
      if (!userConfig) {
        await signOut(auth);
        setAuthState("unauthorized");
        return;
      }
      setAthleteId(userConfig.athleteId);
      setAuthState(userConfig.role);
    });
  }, []);

  const handleSignOut = useCallback(() => signOut(auth), []);

  if (authState === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: COLORS.bg }}>
        <style>{css}</style>
        <div className="spinner" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <LoginScreen />;
  }

  if (authState === "unauthorized") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0e14", color: "#e8edf5", fontFamily: "DM Sans, sans-serif", gap: 16 }}>
        <style>{css}</style>
        <div style={{ fontSize: "2rem" }}>🔒</div>
        <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>Access Restricted</div>
        <div style={{ color: "#5a6a7e", fontSize: "0.9rem", textAlign: "center", maxWidth: 280 }}>This app is private. You are not authorised to access it.</div>
      </div>
    );
  }

  if (authState === "parent" && viewingAthleteId) {
    return (
      <AthleteMain
        athleteId={viewingAthleteId}
        isParent={true}
        user={user}
        onBack={() => setViewingId(null)}
        onSignOut={handleSignOut}
      />
    );
  }

  if (authState === "parent") {
    return (
      <ParentDashboard
        user={user}
        onSelectAthlete={(id) => setViewingId(id)}
        onSignOut={handleSignOut}
      />
    );
  }

  // authState === "athlete"
  return (
    <AthleteView
      athleteId={athleteId}
      user={user}
      onSignOut={handleSignOut}
    />
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: COLORS.bg, padding: 16 }}>
      <style>{css}</style>
      <div className="card" style={{ maxWidth: 420, width: "100%", textAlign: "center", padding: "40px 32px" }}>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: COLORS.accent, marginBottom: 6, letterSpacing: "0.06em" }}>Performance Tracker</h1>
        <p style={{ color: COLORS.muted, fontSize: "0.82rem", marginBottom: 36 }}>Tennis · Cheerleading · Strength</p>
        <button
          className="btn btn-primary"
          onClick={handleGoogle}
          disabled={loading}
          style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "0.95rem" }}
        >
          {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing in…</> : "Sign in with Google"}
        </button>
        {error && <div className="note-box warn" style={{ marginTop: 16, textAlign: "left" }}>{error}</div>}
      </div>
    </div>
  );
}

// ─── PARENT DASHBOARD ────────────────────────────────────────────────────────
const KNOWN_ATHLETE_ID = "kDybMQH9lefwHI0dRway";

function ParentDashboard({ user, onSelectAthlete, onSignOut }) {
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "athletes", KNOWN_ATHLETE_ID))
      .then(snap => { if (snap.exists()) setAthlete({ id: snap.id, ...snap.data() }); })
      .catch(e => console.error("Load athlete error:", e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh" }}>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div className="flex-between" style={{ alignItems: "center" }}>
            <div>
              <h1>Performance Tracker</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.7rem", background: COLORS.accentMuted, color: COLORS.accent, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>Parent</span>
                <span style={{ fontSize: "0.75rem", color: COLORS.muted }}>{user.displayName}</span>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
          </div>
        </div>

        <div className="card">
          <div className="card-title"><Users size={18} /> Athletes</div>
          {loading
            ? <div className="empty"><div className="spinner" /></div>
            : !athlete
              ? <div className="empty">Athlete profile not found.</div>
              : (
                <div
                  className="log-item athlete-row"
                  onClick={() => onSelectAthlete(athlete.id)}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{athlete.name}</span>
                    {athlete.gaps?.length > 0 && (
                      <div style={{ color: COLORS.muted, fontSize: "0.75rem", marginTop: 3 }}>
                        {athlete.gaps.length} tennis gap{athlete.gaps.length !== 1 ? "s" : ""} set
                      </div>
                    )}
                  </div>
                  <span style={{ color: COLORS.accent, fontWeight: 600 }}>View →</span>
                </div>
              )
          }
        </div>
      </div>
    </div>
  );
}

// ─── ALERTS BANNER ────────────────────────────────────────────────────────────
function AlertsBanner({ athleteId, wellbeing, sessionHistory, weekLogs }) {
  const [alerts, setAlerts]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [dismissed, setDismissed] = useState({});

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);

      // Load dismissed alert IDs first
      let dismissedMap = {};
      try {
        const snap = await getDocs(collection(db, "athletes", athleteId, "dismissedAlerts"));
        snap.docs.forEach(d => { dismissedMap[d.id] = true; });
      } catch (_) {}
      if (cancelled) return;
      setDismissed(dismissedMap);

      const metrics = calculateMetrics(weekLogs, wellbeing);

      // Helpers
      const recentWellbeing = (days) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = toLocalDateStr(cutoff);
        const byDate = mergeWellbeingByDate((wellbeing || []).filter(w => w.date >= cutoffStr));
        return Object.values(byDate).sort((a, b) => a.date < b.date ? -1 : 1);
      };

      const checks = [
        // 1. Load spike — ACWR > 1.3
        async () => {
          const { acwr } = metrics;
          if (acwr === null || acwr <= 1.3) return null;
          const id = `load-spike-${Math.round(acwr * 10)}`;
          return {
            id, severity: "red",
            title: "Load Spike Detected",
            body:  `Acute:chronic workload ratio is ${acwr} (threshold: 1.3). High injury risk — consider reducing intensity this week.`,
          };
        },

        // 2. Mood decline — avg mood < 2.5 for 3+ consecutive recent days
        async () => {
          const recent = recentWellbeing(7);
          const moodDays = recent.filter(w => w.mood != null);
          if (moodDays.length < 3) return null;
          let consecutiveLow = 0;
          for (let i = moodDays.length - 1; i >= 0; i--) {
            if (moodDays[i].mood < 2.5) consecutiveLow++;
            else break;
          }
          if (consecutiveLow < 3) return null;
          const id = `mood-decline-${moodDays[moodDays.length - 1].date}`;
          return {
            id, severity: "orange",
            title: "Mood Decline",
            body:  `Mood has been below 2.5/5 for ${consecutiveLow} consecutive days. Check in with your athlete.`,
          };
        },

        // 3. Deferred escalations
        async () => {
          const escalated = await refreshEscalations(athleteId);
          if (!escalated.length) return null;
          return escalated.map(e => ({
            id:       `escalation-${e.id}`,
            severity: "red",
            title:    `Priority Escalated: ${e.priority}`,
            body:     `"${e.priority}" has been deferred for ${e.weeksDeferredCount} weeks without resolution.${e.reason ? ` Reason: ${e.reason}` : ""}`,
          }));
        },

        // 4. Overdue fitness test — no benchmark session in 56 days, or never logged
        async () => {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 56);
          const cutoffStr = cutoff.toISOString().split("T")[0];
          const hasRecent = (sessionHistory || []).some(
            s => (s.type === "fitness_test" || s.isBenchmark) && s.date >= cutoffStr
          );
          if (hasRecent) return null;
          const id = `fitness-test-overdue`;
          return {
            id, severity: "gray",
            title: "Fitness Test Overdue",
            body:  "No benchmark fitness test logged in the past 8 weeks. Consider scheduling one.",
          };
        },

        // 5. Upcoming tournament within 7 days
        async () => {
          const snap = await getDocs(collection(db, "athletes", athleteId, "weekLogs"));
          const logs = snap.docs.map(d => d.data());
          const today = new Date().toISOString().split("T")[0];
          const in7 = new Date();
          in7.setDate(in7.getDate() + 7);
          const in7Str = in7.toISOString().split("T")[0];
          const upcoming = logs.find(
            l => l.tournamentDate && l.tournamentDate >= today && l.tournamentDate <= in7Str
          );
          if (!upcoming) return null;
          const id = `tournament-${upcoming.tournamentDate}`;
          return {
            id, severity: "blue",
            title: "Tournament This Week",
            body:  `Tournament on ${upcoming.tournamentDate}. Review the weekly plan and ensure a taper is in place.`,
          };
        },

        // 6. Sleep deficit — avg sleep < 7h for 5 recent days
        async () => {
          const recent = recentWellbeing(7);
          const sleepDays = recent.filter(w => w.sleep != null);
          if (sleepDays.length < 5) return null;
          const avgSleep = sleepDays.reduce((s, w) => s + w.sleep, 0) / sleepDays.length;
          if (avgSleep >= 7) return null;
          const id = `sleep-deficit-${sleepDays[sleepDays.length - 1].date}`;
          return {
            id, severity: "orange",
            title: "Sleep Deficit",
            body:  `Average sleep is ${avgSleep.toFixed(1)} hours over the past ${sleepDays.length} days (recommended: 7+).`,
          };
        },

        // 7. Extended high load — 3 consecutive weeks sRPE > 2000
        async () => {
          const { weekSRPEs } = metrics;
          const consecutiveHigh = weekSRPEs.slice(0, 3).every(s => s > 2000);
          if (!consecutiveHigh) return null;
          return {
            id: `high-load-3wk`, severity: "orange",
            title: "Extended High Training Load",
            body:  `sRPE has exceeded 2000 for 3 consecutive weeks (${weekSRPEs[2]}, ${weekSRPEs[1]}, ${weekSRPEs[0]}). Consider a deload week.`,
          };
        },

        // 8. Technical review due
        async () => {
          const today = new Date().toISOString().split("T")[0];
          const snap = await getDocs(collection(db, "athletes", athleteId, "technicalAssessments"));
          const allDocs = snap.docs.map(d => d.data());
          // latest entry per stroke area
          const byArea = {};
          allDocs.forEach(a => {
            if (!byArea[a.strokeArea] || a.date > byArea[a.strokeArea].date) byArea[a.strokeArea] = a;
          });
          const due = Object.values(byArea).filter(a => a.reviewDueDate && a.reviewDueDate <= today);
          if (!due.length) return null;
          return due.map(a => ({
            id:       `tech-review-${(a.strokeArea || "").replace(/\s+/g, "-")}-${a.reviewDueDate}`,
            severity: "blue",
            title:    `🎥 Video Review Due: ${a.strokeArea}`,
            body:     `Scheduled review date reached. Last assessed ${a.date}.`,
          }));
        },
      ];

      const results = await Promise.all(checks.map(fn => fn().catch(() => null)));
      if (cancelled) return;

      const severityOrder = { red: 0, orange: 1, blue: 2, gray: 3 };
      const flat = results
        .flat()
        .filter(Boolean)
        .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
      setAlerts(flat);
      setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [athleteId, weekLogs, wellbeing, sessionHistory]);

  const dismiss = async (alertId) => {
    setDismissed(prev => ({ ...prev, [alertId]: true }));
    try {
      await setDoc(
        doc(db, "athletes", athleteId, "dismissedAlerts", alertId),
        { dismissedAt: new Date().toISOString() }
      );
    } catch (_) {}
  };

  const visible = alerts.filter(a => !dismissed[a.id]);

  if (loading) {
    return (
      <div style={{ padding: "8px 16px", color: COLORS.muted, fontSize: "0.75rem" }}>
        Checking alerts…
      </div>
    );
  }

  if (!visible.length) return null;

  const severityStyle = {
    red:    { border: `1px solid ${COLORS.red}`,    background: "rgba(255,77,109,0.08)",  color: COLORS.red    },
    orange: { border: "1px solid #f59e0b",           background: "rgba(245,158,11,0.08)",  color: "#f59e0b"     },
    blue:   { border: "1px solid #3b82f6",           background: "rgba(59,130,246,0.08)",  color: "#3b82f6"     },
    gray:   { border: `1px solid ${COLORS.muted}`,   background: "rgba(90,106,126,0.08)",  color: COLORS.muted  },
  };

  return (
    <div style={{ padding: "0 16px 8px" }}>
      {visible.map(alert => {
        const s = severityStyle[alert.severity] || severityStyle.gray;
        return (
          <div key={alert.id} style={{
            ...s,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 8,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "0.82rem", color: s.color, marginBottom: 2 }}>
                {alert.title}
              </div>
              <div style={{ fontSize: "0.78rem", color: COLORS.text, lineHeight: 1.5 }}>
                {alert.body}
              </div>
            </div>
            <button
              onClick={() => dismiss(alert.id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.muted, fontSize: "1rem", lineHeight: 1,
                padding: "0 2px", flexShrink: 0,
              }}
              aria-label="Dismiss"
            >×</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── ATHLETE MAIN ─────────────────────────────────────────────────────────────
function AthleteMain({ athleteId, isParent, user, onBack, onSignOut }) {
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

        {tab === "plan"     && <PlanTab athleteId={athleteId} profile={profile} weekLogs={weekLogs} sessionHistory={sessionHistory} wellbeing={wellbeing} aiLoading={aiLoading} setAiLoading={setAiLoading} planResult={planResult} setPlanResult={setPlanResult} />}
        {tab === "log"      && <LogTab weekLogs={weekLogs} addWeekLog={addWeekLog} deleteWeekLog={deleteWeekLog} />}
        {tab === "strength" && <StrengthLogTab sessionHistory={sessionHistory} addSession={addSession} planResult={planResult} />}
        {tab === "matches"     && <MatchesTab     athleteId={athleteId} />}
        {tab === "priorities"  && <PrioritiesTab  athleteId={athleteId} />}
        {tab === "benchmarks"  && isParent && <BenchmarksTab athleteId={athleteId} profile={profile} />}
        {tab === "technical"   && isParent && <TechnicalTab  athleteId={athleteId} />}
        {tab === "profile"     && <ProfileTab     profile={profile} saveProfile={saveProfile} />}
      </div>
    </>
  );
}

// ─── MATCH DETAIL VIEW ────────────────────────────────────────────────────────
function MatchDetail({ match, onBack, onDelete, athleteId }) {
  const [confirmDelete,   setConfirmDelete]   = useState(false);
  const [analysis,        setAnalysis]        = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError,   setAnalysisError]   = useState(null);
  const [escalations,     setEscalations]     = useState([]);

  const v    = match.valissa  || {};
  const o    = match.opponent || {};
  const calc = match.calculated || {};
  const rally = calc.rallyDistribution || {};

  // Load existing saved analysis on mount
  useEffect(() => {
    if (!athleteId) return;
    const matchId = match.id || match.matchId;
    if (!matchId) return;
    getDoc(doc(db, "athletes", athleteId, "matchAnalyses", matchId))
      .then(snap => { if (snap.exists()) setAnalysis(snap.data()); })
      .catch(() => {});
  }, [athleteId, match.id, match.matchId]);

  const handleGenerateAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const context = await buildAthleteContext(athleteId);

      const acwr = context.sessionLogs.acwr;
      const loadLevel = acwr == null ? "Unknown"
        : acwr < 0.8  ? "Low"
        : acwr <= 1.3 ? "Optimal"
        : acwr <= 1.5 ? "High"
        : "Very High";

      const matchId = match.id || match.matchId;
      const dp = context.deferredPriorities;

      const scoreStr = (match.setScores?.p1 || [])
        .map((s, i) => `${s}–${match.setScores?.p2?.[i] ?? "?"}`)
        .join(", ") || "unknown";

      const safePct = (won, total) =>
        won != null && total > 0 ? Math.round(won / total * 100) + "%" : "—";

      const systemPrompt =
        "You are an expert youth tennis coach analyzing a competitive match for a developing athlete. " +
        "Your role is to provide developmental coaching insights — find patterns, highlight strengths, " +
        "identify priorities for growth. Be constructive and age-appropriate. " +
        "Return ONLY a raw JSON object. Do NOT wrap in markdown code fences. Do NOT include ```json or ``` anywhere in your response. Start your response with { and end with }.";

      const userPrompt =
`Analyze this tennis match for ${context.athleteProfile?.name || "Valissa"}, age ${context.athleteProfile?.age || 12}.

MATCH: ${match.whoWonMatch === 1 ? "WIN" : "LOSS"} vs ${match.opponentName || "Opponent"} on ${match.matchStartTime ? new Date(match.matchStartTime).toLocaleDateString() : "unknown date"}
Score: ${scoreStr}

SERVICE STATS (Valissa / Opponent):
- 1st Serve %: ${v.firstServePct != null ? Math.round(v.firstServePct <= 1 ? v.firstServePct * 100 : v.firstServePct) : "—"}% / ${o.firstServePct != null ? Math.round(o.firstServePct <= 1 ? o.firstServePct * 100 : o.firstServePct) : "—"}%
- 1st Serve Pts Won: ${safePct(v.firstServePointsWon, v.firstServePoints)} / ${safePct(o.firstServePointsWon, o.firstServePoints)}
- 2nd Serve Pts Won: ${safePct(v.secondServePointsWon, v.secondServePoints)} / ${safePct(o.secondServePointsWon, o.secondServePoints)}
- Aces: ${v.aces ?? "—"} / ${o.aces ?? "—"}
- Double Faults: ${v.doubleFaults ?? "—"} / ${o.doubleFaults ?? "—"}

POINT STATS (Valissa / Opponent):
- Winners: ${v.winners ?? "—"} / ${o.winners ?? "—"}
- Unforced Errors: ${v.unforcedErrors ?? "—"} / ${o.unforcedErrors ?? "—"}
- Forced Errors: ${v.forcedErrors ?? "—"} / ${o.forcedErrors ?? "—"}
- W:UE Ratio: ${calc.wueRatio != null ? Number(calc.wueRatio).toFixed(2) : "—"} / ${o.unforcedErrors > 0 ? (o.winners / o.unforcedErrors).toFixed(2) : "—"}

RALLY PATTERNS:
- 0–4 shots: ${rally["0-4"]?.total ?? "—"} pts, Valissa win ${rally["0-4"]?.valissaWinPct != null ? rally["0-4"].valissaWinPct + "%" : "—"}
- 5–8 shots: ${rally["5-8"]?.total ?? "—"} pts, Valissa win ${rally["5-8"]?.valissaWinPct != null ? rally["5-8"].valissaWinPct + "%" : "—"}
- 9+ shots: ${rally["9+"]?.total ?? "—"} pts, Valissa win ${rally["9+"]?.valissaWinPct != null ? rally["9+"].valissaWinPct + "%" : "—"}

SHOT BREAKDOWN — Valissa (winners / errors):
- Forehand: ${v.fhWinner ?? 0}W / ${v.fhError ?? 0}E
- Backhand: ${v.bhWinner ?? 0}W / ${v.bhError ?? 0}E
- Return (combined): ${(v.fhReturnWinner ?? 0) + (v.bhReturnWinner ?? 0)}W / ${(v.fhReturnError ?? 0) + (v.bhReturnError ?? 0)}E
- Approach: ${v.approachWinner ?? 0}W / ${v.approachError ?? 0}E

ATHLETE CONTEXT:
- Training load this week (sRPE): ${context.sessionLogs.thisWeekSrpe}
- 4-week avg sRPE: ${context.sessionLogs.fourWeekAvgSrpe}
- ACWR: ${acwr ?? "N/A"} — Load level: ${loadLevel}
- Avg sleep (7 days): ${context.wellbeing.avgSleepHours != null ? context.wellbeing.avgSleepHours + "h" : "no data"}
- Avg mood: ${context.wellbeing.avgMood != null ? context.wellbeing.avgMood + "/5" : "no data"}
- Low mood flag: ${context.wellbeing.lowMoodFlag ? "YES — 3+ consecutive low mood days" : "No"}
- Upcoming tournament: ${context.tournamentStatus.hasUpcomingTournament ? `Yes, ${context.tournamentStatus.daysUntilTournament} days away` : "None"}
- Recent tournament (last 14 days): ${context.tournamentStatus.playedTournamentRecently ? `Yes, ${context.tournamentStatus.daysSinceTournament} days ago` : "No"}

EXISTING DEFERRED PRIORITIES (${dp.length} active):
${dp.length > 0 ? dp.map(d => `- ${d.priority} (deferred ${d.weeksDeferredCount} weeks)`).join("\n") : "None"}

Respond with exactly this JSON structure:
{
  "matchSummary": "2-3 sentence tactical overview of the match",
  "loadContext": "How her current training load, sleep and wellbeing context affects interpretation of this match",
  "criticalFindings": [
    { "finding": "specific observation", "priority": "critical|important|monitor" }
  ],
  "strengthsToReinforce": ["strength1", "strength2"],
  "rallyPatternAnalysis": "Analysis of short/medium/long rally win rates and what they reveal tactically",
  "serveAnalysis": "Specific serve observations and development priorities",
  "shotBreakdownInsights": "Key insights from shot-level winner and error patterns",
  "deferredPriorities": [
    { "priority": "short label", "reason": "why defer now", "resolveCondition": "when to address" }
  ],
  "parentNote": "Message for the parent — context, encouragement, what to watch for",
  "athleteNote": "Direct message for ${context.athleteProfile?.name || "Valissa"} — positive, motivating, 1-2 action points"
}`;

      const parsed = await callClaudeJSON({ system: systemPrompt, userContent: userPrompt, maxTokens: 6000 });

      await setDoc(doc(db, "athletes", athleteId, "matchAnalyses", matchId), {
        ...parsed,
        matchId,
        generatedAt: new Date().toISOString(),
      });

      if (parsed.deferredPriorities?.length > 0) {
        await saveDeferredPriorities(athleteId, parsed.deferredPriorities);
      }

      const escalatedItems = await refreshEscalations(athleteId);

      setAnalysis(parsed);
      setEscalations(escalatedItems);
    } catch (err) {
      console.error("Analysis error:", err);
      setAnalysisError("Failed to generate analysis. Make sure the backend server is running.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const won = match.whoWonMatch === 1;

  const fmtDate = ts => ts
    ? new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  const fmt      = val => val != null ? val : "—";
  // firstServePct may be stored as decimal (0.65) or integer percentage (65)
  const fmtPct   = val => val != null ? `${Math.round(typeof val === "number" && val <= 1 ? val * 100 : val)}%` : "—";
  const fmtRatio = val => val != null ? Number(val).toFixed(2) : "—";
  const calcPct  = (won, total) => (total > 0 && won != null) ? `${Math.round(won / total * 100)}%` : "—";

  // Score from top-level setScores arrays (setOnePlayerOne etc.)
  const score = (() => {
    const sc = match.setScores;
    if (sc && sc.p1 && sc.p1.length) {
      return sc.p1.map((s, i) => `${s}–${sc.p2[i] ?? "?"}`).join(", ");
    }
    // Legacy fallback (old documents stored setOneScore on valissa stats)
    const sets = [];
    if (v.setOneScore != null && o.setOneScore != null) sets.push(`${v.setOneScore}–${o.setOneScore}`);
    if (v.setTwoScore != null && o.setTwoScore != null) sets.push(`${v.setTwoScore}–${o.setTwoScore}`);
    return sets.length ? sets.join(", ") : "—";
  })();

  const oppWueRatio = o.unforcedErrors > 0 ? o.winners / o.unforcedErrors : null;

  // ── Shared table styles ──
  const TH  = { fontSize: "0.7rem", color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", padding: "5px 8px", textAlign: "right" };
  const THL = { ...TH, textAlign: "left" };
  const THV = { ...TH, color: COLORS.accent };
  const TD  = { padding: "9px 8px", fontSize: "0.88rem", textAlign: "right", borderTop: `1px solid ${COLORS.border}`, color: COLORS.text };
  const TDL = { ...TD, textAlign: "left", color: COLORS.muted, fontSize: "0.82rem" };

  // Side-by-side stat table: rows = [label, valissaVal, oppVal, valissaColor?]
  const SideBySide = ({ rows }) => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={THL}>Stat</th>
          <th style={THV}>{match.valissaName || "Valissa"}</th>
          <th style={TH}>{match.opponentName || "Opponent"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, vVal, oVal, vColor]) => (
          <tr key={label}>
            <td style={TDL}>{label}</td>
            <td style={{ ...TD, color: vColor || COLORS.text, fontWeight: vColor ? 700 : 400 }}>{vVal}</td>
            <td style={TD}>{oVal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Match History
      </button>

      {/* ── Section 1: Match Info ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.text, lineHeight: 1.1 }}>
              vs {match.opponentName || "Unknown Opponent"}
            </div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem", marginTop: 3 }}>{fmtDate(match.matchStartTime)}</div>
          </div>
          <span className={`badge ${won ? "badge-green" : "badge-red"}`}>{won ? "Win" : "Loss"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[["Score", score], ["Tournament", match.season || "—"]].map(([label, val]) => (
            <div key={label}>
              <div className="label">{label}</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: COLORS.text, marginTop: 3 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Service Stats ── */}
      <div className="card">
        <div className="card-title"><Zap size={16} /> Service Stats</div>
        <SideBySide rows={[
          ["1st Serve %",          fmtPct(v.firstServePct),                               fmtPct(o.firstServePct)],
          ["1st Serve Pts Won",    calcPct(v.firstServePointsWon, v.firstServePoints),     calcPct(o.firstServePointsWon, o.firstServePoints)],
          ["2nd Serve Pts Won",    calcPct(v.secondServePointsWon, v.secondServePoints),   calcPct(o.secondServePointsWon, o.secondServePoints)],
          ["Aces",                 fmt(v.aces),                                            fmt(o.aces)],
          ["Double Faults",        fmt(v.doubleFaults),                                   fmt(o.doubleFaults)],
        ]} />
      </div>

      {/* ── Section 3: Return Stats ── */}
      <div className="card">
        <div className="card-title"><Activity size={16} /> Return Stats</div>
        <SideBySide rows={[
          ["1st Return Pts Won",   calcPct(v.firstReturnPointsWon, v.firstReturnPoints),   calcPct(o.firstReturnPointsWon, o.firstReturnPoints)],
          ["2nd Return Pts Won",   calcPct(v.secondReturnPointsWon, v.secondReturnPoints), calcPct(o.secondReturnPointsWon, o.secondReturnPoints)],
          ["Break Pts Converted",  calcPct(v.breakPointsWon, v.breakPoints),               calcPct(o.breakPointsWon, o.breakPoints)],
        ]} />
      </div>

      {/* ── Section 4: Point Stats ── */}
      <div className="card">
        <div className="card-title"><BarChart2 size={16} /> Point Stats</div>
        <SideBySide rows={[
          ["Winners",        fmt(v.winners),       fmt(o.winners)],
          ["Unforced Errors",fmt(v.unforcedErrors), fmt(o.unforcedErrors), v.unforcedErrors > o.unforcedErrors ? COLORS.red : null],
          ["Forced Errors",  fmt(v.forcedErrors),  fmt(o.forcedErrors)],
          ["W:UE Ratio",     fmtRatio(calc.wueRatio), fmtRatio(oppWueRatio)],
        ]} />
      </div>

      {/* ── Section 5: Rally Length ── */}
      <div className="card">
        <div className="card-title"><TrendingUp size={16} /> Rally Length</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={THL}>Rally</th>
              <th style={TH}>Total Pts</th>
              <th style={THV}>Valissa Win %</th>
            </tr>
          </thead>
          <tbody>
            {[["0–4 shots", "0-4"], ["5–8 shots", "5-8"], ["9+ shots", "9+"]].map(([label, key]) => {
              const b = rally[key] || {};
              const pct = b.valissaWinPct;
              const col = pct == null ? COLORS.muted : pct >= 50 ? COLORS.accent : pct >= 40 ? COLORS.yellow : COLORS.red;
              return (
                <tr key={key}>
                  <td style={TDL}>{label}</td>
                  <td style={TD}>{b.total ?? "—"}</td>
                  <td style={{ ...TD, color: col, fontWeight: 700 }}>{pct != null ? `${pct}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Section 6: Shot Breakdown (Valissa only) ── */}
      <div className="card">
        <div className="card-title"><Target size={16} /> Shot Breakdown — {match.valissaName || "Valissa"}</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={THL}>Shot</th>
              <th style={{ ...TH, color: COLORS.accent }}>Winners</th>
              <th style={{ ...TH, color: COLORS.red }}>Errors</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Forehand",  v.fhWinner,       v.fhError],
              ["Backhand",  v.bhWinner,       v.bhError],
              ["Return",    (v.fhReturnWinner ?? 0) + (v.bhReturnWinner ?? 0),
                            (v.fhReturnError  ?? 0) + (v.bhReturnError  ?? 0)],
              ["Approach",  v.approachWinner, v.approachError],
            ].map(([label, w, e]) => (
              <tr key={label}>
                <td style={TDL}>{label}</td>
                <td style={{ ...TD, color: COLORS.accent, fontWeight: 600 }}>{fmt(w)}</td>
                <td style={{ ...TD, color: COLORS.red }}>{fmt(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── AI Coach Analysis ── */}
      <div className="card" style={{ borderColor: COLORS.accentDim, background: `${COLORS.accent}08` }}>
        <div className="card-title"><MessageSquare size={16} /> AI Coach Analysis</div>

        {analysisError && (
          <div style={{ color: COLORS.red, fontSize: "0.83rem", marginBottom: 12 }}>{analysisError}</div>
        )}

        {escalations.length > 0 && (
          <div style={{ background: `${COLORS.red}18`, border: `1px solid ${COLORS.red}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.85rem", marginBottom: 6 }}>⚠ Escalated Priorities</div>
            {escalations.map((e, i) => (
              <div key={i} style={{ fontSize: "0.82rem", color: COLORS.text, marginBottom: 4 }}>
                <strong>{e.priority}</strong> — deferred {e.weeksDeferredCount} weeks
              </div>
            ))}
          </div>
        )}

        {!analysis && !analysisLoading && (
          <>
            <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 14 }}>
              Generate a personalized coaching report for this match based on serve stats, return stats, rally patterns, and shot distribution.
            </p>
            <button className="btn btn-primary" onClick={handleGenerateAnalysis} style={{ gap: 8 }}>
              <Zap size={14} /> Generate Analysis
            </button>
          </>
        )}

        {analysisLoading && (
          <div style={{ textAlign: "center", padding: "24px 0", color: COLORS.muted }}>
            <div style={{ fontSize: "1.4rem", marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: "0.9rem" }}>Analyzing match...</div>
          </div>
        )}

        {analysis && !analysisLoading && (() => {
          const SecHeader = ({ children, color }) => (
            <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: color || COLORS.muted, marginBottom: 6 }}>
              {children}
            </div>
          );
          return (
            <div>
              {/* Match Summary */}
              <div style={{ marginBottom: 18 }}>
                <SecHeader>Match Summary</SecHeader>
                <p style={{ fontSize: "0.88rem", color: COLORS.text, lineHeight: 1.6, margin: 0 }}>{analysis.matchSummary}</p>
              </div>

              {/* Load & Wellbeing Context */}
              {analysis.loadContext && (
                <div style={{ background: `${COLORS.accent}10`, border: `1px solid ${COLORS.accentDim}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                  <SecHeader color={COLORS.accentDim}>Load & Wellbeing Context</SecHeader>
                  <p style={{ fontSize: "0.83rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.loadContext}</p>
                </div>
              )}

              {/* Critical Findings */}
              {analysis.criticalFindings?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Critical Findings</SecHeader>
                  {analysis.criticalFindings.map((cf, i) => {
                    const borderCol = cf.priority === "critical" ? COLORS.red : cf.priority === "important" ? COLORS.yellow : COLORS.border;
                    const bgCol     = cf.priority === "critical" ? `${COLORS.red}12` : cf.priority === "important" ? `${COLORS.yellow}12` : "transparent";
                    return (
                      <div key={i} style={{ border: `1px solid ${borderCol}`, background: bgCol, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                        <span style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: borderCol }}>{cf.priority}</span>
                        <p style={{ fontSize: "0.84rem", color: COLORS.text, margin: "4px 0 0" }}>{cf.finding}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Strengths */}
              {analysis.strengthsToReinforce?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Strengths to Reinforce</SecHeader>
                  {analysis.strengthsToReinforce.map((s, i) => (
                    <div key={i} style={{ fontSize: "0.84rem", color: COLORS.text, padding: "5px 0", borderTop: i === 0 ? "none" : `1px solid ${COLORS.border}` }}>
                      ✓ {s}
                    </div>
                  ))}
                </div>
              )}

              {/* Rally Pattern Analysis */}
              {analysis.rallyPatternAnalysis && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Rally Pattern Analysis</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.rallyPatternAnalysis}</p>
                </div>
              )}

              {/* Serve Analysis */}
              {analysis.serveAnalysis && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Serve Analysis</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.serveAnalysis}</p>
                </div>
              )}

              {/* Shot Breakdown Insights */}
              {analysis.shotBreakdownInsights && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Shot Breakdown Insights</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.shotBreakdownInsights}</p>
                </div>
              )}

              {/* Deferred Priorities */}
              {analysis.deferredPriorities?.length > 0 && (
                <div style={{ background: `${COLORS.yellow}10`, border: `1px solid ${COLORS.yellow}50`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                  <SecHeader color={COLORS.yellow}>Deferred Priorities</SecHeader>
                  {analysis.deferredPriorities.map((dp, i) => (
                    <div key={i} style={{ marginBottom: i < analysis.deferredPriorities.length - 1 ? 10 : 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.84rem", color: COLORS.text }}>{dp.priority}</div>
                      {dp.reason && <div style={{ fontSize: "0.78rem", color: COLORS.muted, marginTop: 2 }}>{dp.reason}</div>}
                      {dp.resolveCondition && <div style={{ fontSize: "0.78rem", color: COLORS.muted, marginTop: 2, fontStyle: "italic" }}>Resolve when: {dp.resolveCondition}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Parent Note */}
              {analysis.parentNote && (
                <div style={{ background: `${COLORS.accent}0d`, border: `1px solid ${COLORS.accentDim}60`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                  <SecHeader color={COLORS.accentDim}>Note for Parent</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.parentNote}</p>
                </div>
              )}

              {/* Athlete Note */}
              {analysis.athleteNote && (
                <div style={{ background: `${COLORS.border}60`, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                  <SecHeader>Note for {match.valissaName || "Valissa"}</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.athleteNote}</p>
                </div>
              )}

              <button className="btn btn-ghost btn-sm" onClick={handleGenerateAnalysis} style={{ gap: 6 }}>
                <Zap size={13} /> Regenerate Analysis
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── Delete Match ── */}
      <div className="card" style={{ borderColor: COLORS.red, background: "rgba(255,77,109,0.06)" }}>
        {!confirmDelete ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmDelete(true)}
            style={{ color: COLORS.red, borderColor: COLORS.red }}
          >
            Delete Match
          </button>
        ) : (
          <>
            <div style={{ fontSize: "0.85rem", color: COLORS.text, marginBottom: 12 }}>
              Delete this match and re-import?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn btn-sm"
                style={{ background: COLORS.red, color: "#fff", border: "none" }}
                onClick={() => onDelete(match.id || match.matchId)}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── PRIORITIES TAB ──────────────────────────────────────────────────────────
function PrioritiesTab({ athleteId }) {
  const [items,            setItems]            = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [escalationBanner, setEscalationBanner] = useState([]);
  const [bannerDismissed,  setBannerDismissed]  = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "athletes", athleteId, "deferredPriorities"));
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Failed to load deferred priorities:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!athleteId) return;
    (async () => {
      // Promote eligible items first, then load the list, so the list reflects
      // the post-escalation state (no active/escalated split-brain on first paint).
      try {
        const escalated = await refreshEscalations(athleteId);
        if (escalated.length > 0) setEscalationBanner(escalated);
      } catch (_) {}
      await loadItems();
    })();
  }, [athleteId]);

  const handleResolve = async (priority) => {
    try {
      await resolveDeferred(athleteId, priority);
      await loadItems();
    } catch (e) {
      console.error("Failed to resolve priority:", e);
    }
  };

  const toDate = ts => {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  };

  const fmtDate = ts => {
    const d = toDate(ts);
    return d ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
  };

  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const active = items
    .filter(i => i.status === "active")
    .sort((a, b) => (b.weeksDeferredCount ?? 0) - (a.weeksDeferredCount ?? 0));

  const escalated = items.filter(i => i.status === "escalated");

  const resolved = items.filter(i => {
    if (i.status !== "resolved") return false;
    const d = toDate(i.addressedDate);
    return d && d >= cutoff30;
  });

  const SectionHeader = ({ children, count }) => (
    <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.muted, marginBottom: 10 }}>
      {children} <span style={{ color: COLORS.accent }}>({count})</span>
    </div>
  );

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 32 }}>
        <div className="spinner" />
      </div>
    );
  }

  const isEmpty = active.length === 0 && escalated.length === 0 && resolved.length === 0;

  return (
    <div>
      {/* Escalation banner */}
      {!bannerDismissed && escalationBanner.length > 0 && (
        <div style={{ background: `${COLORS.red}18`, border: `1px solid ${COLORS.red}`, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.88rem", marginBottom: 6 }}>
              ⚠ {escalationBanner.length} priority item{escalationBanner.length !== 1 ? "s" : ""} newly escalated
            </div>
            {escalationBanner.map((e, i) => (
              <div key={i} style={{ fontSize: "0.82rem", color: COLORS.text }}>{e.priority}</div>
            ))}
          </div>
          <button onClick={() => setBannerDismissed(true)} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: "1.1rem", padding: "0 0 0 12px", lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: 10 }}>✓</div>
          <div style={{ color: COLORS.muted, fontSize: "0.88rem" }}>
            No deferred priorities — all development areas are being addressed.
          </div>
        </div>
      )}

      {/* Group 1 — Active */}
      {active.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader count={active.length}>Active</SectionHeader>
          {active.map(item => (
            <div key={item.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: COLORS.text, flex: 1, marginRight: 10 }}>
                  {(item.weeksDeferredCount ?? 0) >= 3 && <span style={{ marginRight: 5 }}>⚠️</span>}
                  {item.priority}
                </div>
                <span style={{ fontSize: "0.7rem", background: `${COLORS.accent}18`, color: COLORS.accent, borderRadius: 20, padding: "3px 9px", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {item.weeksDeferredCount ?? 0} wk{(item.weeksDeferredCount ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
              {item.reason && (
                <div style={{ fontSize: "0.82rem", color: COLORS.muted, marginBottom: 5 }}>{item.reason}</div>
              )}
              {item.resolveCondition && (
                <div style={{ fontSize: "0.79rem", color: COLORS.muted, fontStyle: "italic", marginBottom: 5 }}>
                  Resolve when: {item.resolveCondition}
                </div>
              )}
              {item.targetWeek && (
                <div style={{ fontSize: "0.74rem", color: COLORS.muted, marginBottom: 10 }}>Target: {item.targetWeek}</div>
              )}
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: COLORS.accent, borderColor: COLORS.accentDim, fontSize: "0.78rem", marginTop: item.reason || item.resolveCondition || item.targetWeek ? 4 : 0 }}
                onClick={() => handleResolve(item.priority)}
              >
                ✓ Mark as Addressed
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Group 2 — Escalated */}
      {escalated.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="card" style={{ borderColor: COLORS.red, background: `${COLORS.red}08` }}>
            <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.88rem", marginBottom: 12 }}>
              🚨 Needs Attention — Deferred 4+ Weeks
            </div>
            {escalated.map((item, i) => (
              <div key={item.id} style={{
                paddingBottom: i < escalated.length - 1 ? 12 : 0,
                marginBottom:  i < escalated.length - 1 ? 12 : 0,
                borderBottom:  i < escalated.length - 1 ? `1px solid ${COLORS.border}` : "none",
              }}>
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: COLORS.text, marginBottom: 4 }}>{item.priority}</div>
                <div style={{ fontSize: "0.76rem", color: COLORS.muted, marginBottom: 8 }}>
                  First deferred: {fmtDate(item.deferredDate)} · Escalated: {fmtDate(item.escalatedDate)}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: COLORS.accent, borderColor: COLORS.accentDim, fontSize: "0.78rem" }}
                  onClick={() => handleResolve(item.priority)}
                >
                  ✓ Mark as Addressed
                </button>
              </div>
            ))}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.red}33`, fontSize: "0.78rem", color: COLORS.red, fontStyle: "italic" }}>
              These development areas have not been trainable for 4+ consecutive weeks. Review whether the weekly schedule has capacity.
            </div>
          </div>
        </div>
      )}

      {/* Group 3 — Recently Resolved */}
      {resolved.length > 0 && (
        <div>
          <SectionHeader count={resolved.length}>Recently Resolved</SectionHeader>
          {resolved.map(item => (
            <div key={item.id} className="card" style={{ borderColor: `${COLORS.accent}40`, background: `${COLORS.accent}06`, marginBottom: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: COLORS.accent, fontSize: "1.2rem", lineHeight: 1 }}>✓</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: COLORS.text }}>{item.priority}</div>
                  <div style={{ fontSize: "0.75rem", color: COLORS.muted, marginTop: 2 }}>Addressed {fmtDate(item.addressedDate)}</div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: "0.71rem", color: COLORS.muted, marginTop: 2 }}>Resolved items auto-archive after 30 days.</div>
        </div>
      )}
    </div>
  );
}

// ─── MATCHES TAB ──────────────────────────────────────────────────────────────
// ─── SEASON REPORT VIEW ──────────────────────────────────────────────────────
function SeasonReportView({ report, onBack, onRegenerate, seasonLoading }) {
  const urgencyColor = u => u === "high" ? COLORS.red : u === "medium" ? COLORS.yellow : COLORS.muted;
  const fmtDate = iso => iso
    ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const sorted = [...(report.consistentWeaknesses ?? [])].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3);
  });

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        <ChevronLeft size={15} /> Match History
      </button>

      {/* Header */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="flex-between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: COLORS.text }}>Season Analysis</div>
            <div style={{ color: COLORS.muted, fontSize: "0.78rem", marginTop: 4 }}>
              {report.totalMatchesAnalyzed ?? report.matchCount} matches · Generated {fmtDate(report.generatedAt)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="label" style={{ marginBottom: 2 }}>Overall Record</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.7rem", color: COLORS.accent, lineHeight: 1 }}>
              {report.overallRecord}
            </div>
          </div>
        </div>
      </div>

      {/* Next Month Priority */}
      <div className="card" style={{ border: `1.5px solid ${COLORS.accent}`, marginBottom: 14 }}>
        <div className="label" style={{ color: COLORS.accent, marginBottom: 8 }}>🎯 Next Month Priority</div>
        <div style={{ fontSize: "1rem", fontWeight: 600, color: COLORS.text, lineHeight: 1.55 }}>
          {report.nextMonthPriority}
        </div>
      </div>

      {/* Consistent Weaknesses */}
      {sorted.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Consistent Weaknesses</div>
          {sorted.map((w, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${urgencyColor(w.urgency)}` }}>
              <div className="flex-between" style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: "0.93rem" }}>{w.metric}</div>
                <span style={{
                  fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
                  color: urgencyColor(w.urgency),
                  background: `${urgencyColor(w.urgency)}22`,
                  padding: "2px 8px", borderRadius: 4,
                }}>
                  {w.urgency}
                </span>
              </div>
              <div style={{ color: COLORS.text, fontSize: "0.84rem", marginBottom: 8 }}>{w.pattern}</div>
              <div style={{ color: COLORS.accent, fontSize: "0.82rem" }}>💡 {w.trainingFocus}</div>
            </div>
          ))}
        </div>
      )}

      {/* Improvements */}
      {(report.improvements ?? []).length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Improvements</div>
          {(report.improvements ?? []).map((imp, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${COLORS.accent}` }}>
              <div style={{ fontWeight: 700, fontSize: "0.93rem", color: COLORS.accent, marginBottom: 4 }}>↑ {imp.metric}</div>
              <div style={{ color: COLORS.text, fontSize: "0.84rem" }}>{imp.trend}</div>
            </div>
          ))}
        </div>
      )}

      {/* Inconsistencies */}
      {(report.inconsistencies ?? []).length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Inconsistencies</div>
          {(report.inconsistencies ?? []).map((inc, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${COLORS.yellow}` }}>
              <div style={{ fontWeight: 700, fontSize: "0.93rem", color: COLORS.yellow, marginBottom: 4 }}>{inc.metric}</div>
              <div style={{ color: COLORS.text, fontSize: "0.84rem" }}>{inc.observation}</div>
            </div>
          ))}
        </div>
      )}

      {/* Developmental Stage */}
      {report.developmentalStageAssessment && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Developmental Stage</div>
          <div style={{ color: COLORS.text, fontSize: "0.87rem", lineHeight: 1.65 }}>{report.developmentalStageAssessment}</div>
        </div>
      )}

      {/* Long Term Outlook */}
      {report.longTermOutlook && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Long Term Outlook</div>
          <div style={{ color: COLORS.text, fontSize: "0.87rem", lineHeight: 1.65 }}>{report.longTermOutlook}</div>
        </div>
      )}

      {/* Parent Note */}
      {report.parentNote && (
        <div className="card" style={{ marginBottom: 14, background: "rgba(0,229,160,0.06)", borderColor: COLORS.accentDim }}>
          <div className="card-title" style={{ color: COLORS.accent, marginBottom: 8 }}>A Note for You</div>
          <div style={{ color: COLORS.text, fontSize: "0.87rem", lineHeight: 1.65, fontStyle: "italic" }}>{report.parentNote}</div>
        </div>
      )}

      <button
        className="btn btn-ghost"
        onClick={onRegenerate}
        disabled={seasonLoading}
        style={{ width: "100%", marginTop: 4 }}
      >
        {seasonLoading ? "Analyzing season…" : "↺ Regenerate Season Analysis"}
      </button>
    </div>
  );
}

// ─── MATCHES TAB ─────────────────────────────────────────────────────────────
function MatchesTab({ athleteId }) {
  const fileRef = useRef(null);
  const [status,              setStatus]             = useState(null);
  const [busy,                setBusy]               = useState(false);
  const [matches,             setMatches]            = useState([]);
  const [loadingMatches,      setLoadingMatches]     = useState(true);
  const [selectedMatch,       setSelectedMatch]      = useState(null);
  const [seasonReport,        setSeasonReport]       = useState(null);
  const [seasonLoading,       setSeasonLoading]      = useState(false);
  const [viewingSeasonReport, setViewingSeasonReport] = useState(false);

  // Fetch matches + cached season report on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [matchSnap, reportSnap] = await Promise.all([
          getDocs(collection(db, "matches")),
          getDoc(doc(db, "athletes", athleteId, "reports", "seasonLatest")),
        ]);
        if (cancelled) return;
        const all = matchSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(m => m.athleteId === athleteId)
          .sort((a, b) => {
            if (!a.matchStartTime) return 1;
            if (!b.matchStartTime) return -1;
            return b.matchStartTime.localeCompare(a.matchStartTime);
          });
        setMatches(all);
        if (reportSnap.exists()) setSeasonReport(reportSnap.data());
      } catch (err) {
        console.error("Failed to load matches:", err);
      } finally {
        if (!cancelled) setLoadingMatches(false);
      }
    })();
    return () => { cancelled = true; };
  }, [athleteId]);

  const handleGenerateSeasonAnalysis = async () => {
    setSeasonLoading(true);
    setStatus(null);
    try {
      const chronoMatches = [...matches].sort((a, b) => {
        if (!a.matchStartTime) return 1;
        if (!b.matchStartTime) return -1;
        return a.matchStartTime.localeCompare(b.matchStartTime);
      });

      const matchesWithAnalysis = [];
      for (const match of chronoMatches) {
        const snap = await getDoc(doc(db, "athletes", athleteId, "matchAnalyses", match.id));
        if (snap.exists()) matchesWithAnalysis.push({ ...match, analysis: snap.data() });
      }

      if (matchesWithAnalysis.length === 0) {
        setStatus({ ok: false, text: "No match analyses found — generate AI analysis for at least one match first." });
        setSeasonLoading(false);
        return;
      }

      const ctx = await buildAthleteContext(athleteId);

      const fmtMatchScore = m => {
        const sc = m.setScores;
        if (sc?.p1?.length) return sc.p1.map((s, i) => `${s}–${sc.p2[i] ?? "?"}`).join(", ");
        return "—";
      };

      const matchLines = matchesWithAnalysis.map((m, idx) => {
        const date = m.matchStartTime
          ? new Date(m.matchStartTime).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
          : "Unknown date";
        const result = m.whoWonMatch === 1 ? "Win" : "Loss";
        const v = m.valissa ?? {};
        const o = m.opponent ?? {};
        const calc = m.calculated ?? {};
        const rally = calc.rallyDistribution ?? {};
        const findings = (m.analysis?.criticalFindings ?? []).map(f => `${f.area}: ${f.finding}`).join(" | ");
        return [
          `Match ${idx + 1} — ${date} vs ${m.opponentName || "Opponent"} — ${result} ${fmtMatchScore(m)}`,
          `Tournament: ${m.season || "—"}`,
          `Valissa: W=${v.winners ?? 0} UE=${v.unforcedErrors ?? 0} FE=${v.forcedErrors ?? 0} 1st serve=${v.firstServePct != null ? Number(v.firstServePct).toFixed(1) : "—"}% DF=${v.doubleFaults ?? 0}`,
          `Opponent: W=${o.winners ?? 0} UE=${o.unforcedErrors ?? 0}`,
          `Rally win rates: 0-4shots=${rally["0-4"]?.valissaWinPct ?? "—"}% 5-8shots=${rally["5-8"]?.valissaWinPct ?? "—"}% 9+shots=${rally["9+"]?.valissaWinPct ?? "—"}%`,
          `W:UE ratio: ${calc.wueRatio ?? "—"}`,
          findings ? `AI analysis critical findings: ${findings}` : null,
        ].filter(Boolean).join("\n");
      }).join("\n\n");

      const userMsg = `Athlete: Valissa, age 12, female junior tennis player
Season review across ${matchesWithAnalysis.length} matches:

${matchLines}

Current training load context:
Weekly sRPE: ${ctx.thisWeekSRPE ?? "—"} | ACWR: ${ctx.acuteChronicRatio ?? "—"} | Load level: ${ctx.loadLevel ?? "—"}`;

      const systemPrompt = `You are a junior tennis development coach conducting a season review for a 12-year-old female athlete named Valissa. Analyze the following match statistics across multiple matches in chronological order. Return ONLY a raw JSON object — no markdown fences, start with { and end with }:

{
  "totalMatchesAnalyzed": integer,
  "overallRecord": "W-L format",
  "consistentWeaknesses": [
    {
      "metric": "short label",
      "pattern": "what the data shows across matches with specific numbers",
      "urgency": "high | medium | low",
      "trainingFocus": "specific training recommendation"
    }
  ],
  "improvements": [
    {
      "metric": "short label",
      "trend": "specific improvement observed with numbers from earliest to latest match"
    }
  ],
  "inconsistencies": [
    {
      "metric": "short label",
      "observation": "good in some matches poor in others — possible cause"
    }
  ],
  "developmentalStageAssessment": "paragraph on where she is as a developing junior athlete based on all match data — contextualised for age 12",
  "nextMonthPriority": "the single most important technical or physical development focus for the next 30 days with specific reasoning from the data",
  "longTermOutlook": "2-3 sentences on trajectory and what consistent training in her weak areas could produce over 6-12 months",
  "parentNote": "one encouraging paragraph for the parent contextualising the season so far"
}`;

      const parsed = await callClaudeJSON({ system: systemPrompt, userContent: userMsg, maxTokens: 4000 });

      const report = { ...parsed, generatedAt: new Date().toISOString(), matchCount: matchesWithAnalysis.length };
      await setDoc(doc(db, "athletes", athleteId, "reports", "seasonLatest"), report);
      setSeasonReport(report);
      setViewingSeasonReport(true);
    } catch (err) {
      console.error("Season analysis error:", err);
      setStatus({ ok: false, text: `Season analysis failed: ${err.message}` });
    } finally {
      setSeasonLoading(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setStatus(null);

    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = ev => resolve(ev.target.result);
        reader.onerror = () => reject(new Error("read error"));
        reader.readAsText(file);
      });

      let plistObj;
      try {
        plistObj = parsePlist(text);
      } catch (parseErr) {
        console.error("[matchtrack] parsePlist threw:", parseErr.message);
        const msg = parseErr.message === "binary-plist"
          ? "Binary plist format detected — the app expected XML. Check the console for details."
          : "Invalid file format — please select a .matchtrack file";
        setStatus({ ok: false, text: msg });
        setBusy(false);
        return;
      }

      let matchData;
      try {
        matchData = extractMatchData(plistObj);
      } catch (extractErr) {
        console.error("[matchtrack] extractMatchData threw:", extractErr);
        setStatus({ ok: false, text: "Invalid file format — please select a .matchtrack file" });
        setBusy(false);
        return;
      }

      if (!matchData.matchId || matchData.matchId === "undefined") {
        console.error("[matchtrack] matchId missing — top-level plist keys:", Object.keys(plistObj));
        setStatus({ ok: false, text: "Invalid file format — please select a .matchtrack file" });
        setBusy(false);
        return;
      }

      const existing = await getDoc(doc(db, "matches", matchData.matchId));
      if (existing.exists()) {
        setStatus({ ok: false, text: "This match has already been imported" });
        setBusy(false);
        return;
      }

      const stored = { ...matchData, athleteId, importedAt: new Date().toISOString() };
      await setDoc(doc(db, "matches", matchData.matchId), stored);

      // Optimistically prepend to list so it appears immediately
      setMatches(prev => [{ id: matchData.matchId, ...stored }, ...prev]);

      const dateStr = matchData.matchStartTime
        ? new Date(matchData.matchStartTime).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
        : "unknown date";
      setStatus({ ok: true, text: `Match imported — Valissa vs ${matchData.opponentName || "Opponent"} on ${dateStr}` });
    } catch (err) {
      console.error("Match import error:", err);
      setStatus({ ok: false, text: "Invalid file format — please select a .matchtrack file" });
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = ts => ts
    ? new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "Unknown date";

  const fmtScore = match => {
    const sc = match.setScores;
    if (sc?.p1?.length) return sc.p1.map((s, i) => `${s}–${sc.p2[i] ?? "?"}`).join(", ");
    return "—";
  };

  const handleDelete = async (matchId) => {
    try {
      await deleteDoc(doc(db, "matches", matchId));
      setMatches(prev => prev.filter(m => m.id !== matchId));
      setSelectedMatch(null);
    } catch (err) {
      console.error("Failed to delete match:", err);
    }
  };

  if (selectedMatch) {
    return <MatchDetail match={selectedMatch} onBack={() => setSelectedMatch(null)} onDelete={handleDelete} athleteId={athleteId} />;
  }

  if (viewingSeasonReport && seasonReport) {
    return (
      <SeasonReportView
        report={seasonReport}
        onBack={() => setViewingSeasonReport(false)}
        onRegenerate={handleGenerateSeasonAnalysis}
        seasonLoading={seasonLoading}
      />
    );
  }

  return (
    <div>
      {/* ── Import card ── */}
      <div className="card">
        <div className="card-title"><History size={18} /> Match History</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 16 }}>
          Import .matchtrack files to build Valissa's match record.
        </p>
        <input ref={fileRef} name="matchFile" type="file" accept=".matchtrack" style={{ display: "none" }} onChange={handleFile} />
        <button
          className="btn btn-primary"
          onClick={() => { setStatus(null); fileRef.current.click(); }}
          disabled={busy}
          style={{ gap: 8 }}
        >
          <FileText size={16} />
          {busy ? "Importing…" : "Import Match File"}
        </button>
        {status && (
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: status.ok ? "rgba(0,229,160,0.12)" : "rgba(255,77,109,0.12)",
            color: status.ok ? COLORS.accent : COLORS.red,
            fontSize: "0.85rem", fontWeight: 500,
          }}>
            {status.text}
          </div>
        )}
      </div>

      {/* ── Season Intelligence ── */}
      {!loadingMatches && matches.length >= 3 && (
        <div className="card" style={{ borderColor: COLORS.accentDim }}>
          <div className="card-title" style={{ marginBottom: 6 }}>
            <TrendingUp size={16} style={{ color: COLORS.accent }} /> Season Intelligence
          </div>
          {seasonReport ? (
            <div>
              <div style={{ color: COLORS.muted, fontSize: "0.8rem", marginBottom: 12 }}>
                Last generated {new Date(seasonReport.generatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}Record: <span style={{ color: COLORS.accent, fontWeight: 600 }}>{seasonReport.overallRecord}</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" onClick={() => setViewingSeasonReport(true)} style={{ gap: 6 }}>
                  <BarChart2 size={13} /> View Season Report
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleGenerateSeasonAnalysis} disabled={seasonLoading} style={{ gap: 6 }}>
                  {seasonLoading ? "Analyzing…" : "↺ Regenerate"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 12 }}>
                {matches.length} matches recorded. Generate an AI-powered season analysis to identify patterns, improvements, and development priorities.
              </p>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleGenerateSeasonAnalysis}
                disabled={seasonLoading}
                style={{ gap: 6 }}
              >
                <TrendingUp size={13} />
                {seasonLoading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 13, height: 13, border: `2px solid ${COLORS.bg}`,
                      borderTopColor: "transparent", borderRadius: "50%",
                      display: "inline-block", animation: "spin 0.7s linear infinite",
                    }} />
                    Analyzing season…
                  </span>
                ) : "Generate Season Analysis"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Match list ── */}
      {loadingMatches ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: COLORS.muted, fontSize: "0.85rem" }}>
          Loading matches…
        </div>
      ) : matches.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "36px 20px" }}>
          <History size={34} color={COLORS.muted} style={{ opacity: 0.35, marginBottom: 10 }} />
          <div style={{ color: COLORS.muted, fontSize: "0.88rem" }}>No matches imported yet</div>
        </div>
      ) : (
        matches.map(match => {
          const won   = match.whoWonMatch === 1;
          const score = fmtScore(match);
          return (
            <div key={match.id} className="card">
              <div className="flex-between" style={{ alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.97rem", marginBottom: 3 }}>
                    vs {match.opponentName || "Unknown Opponent"}
                  </div>
                  <div style={{ color: COLORS.muted, fontSize: "0.78rem" }}>{fmtDate(match.matchStartTime)}</div>
                </div>
                <span className={`badge ${won ? "badge-green" : "badge-red"}`}>
                  {won ? "Win" : "Loss"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
                <div>
                  <div className="label">Score</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.3rem", color: COLORS.text, lineHeight: 1.1 }}>
                    {score}
                  </div>
                </div>
                {match.season ? (
                  <div>
                    <div className="label">Tournament</div>
                    <div style={{ fontSize: "0.85rem", color: COLORS.text, paddingTop: 2 }}>{match.season}</div>
                  </div>
                ) : null}
              </div>

              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedMatch(match)}>
                <BarChart2 size={13} /> View Analysis
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── TECHNICAL TAB ────────────────────────────────────────────────────────────
function TechnicalTab({ athleteId }) {
  const today6wk = () => {
    const d = new Date(); d.setDate(d.getDate() + 42);
    return d.toISOString().split("T")[0];
  };
  const todayStr = new Date().toISOString().split("T")[0];

  const [assessments,      setAssessments]      = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [showForm,         setShowForm]         = useState(false);
  const [formArea,         setFormArea]         = useState("");
  const [formDate,         setFormDate]         = useState(todayStr);
  const [formSource,       setFormSource]       = useState("Video Analysis");
  const [formText,         setFormText]         = useState("");
  const [formPriority,     setFormPriority]     = useState("Medium");
  const [formSchedule,     setFormSchedule]     = useState(false);
  const [formReviewDate,   setFormReviewDate]   = useState(today6wk());
  const [formSaving,       setFormSaving]       = useState(false);
  const [expandedHistory,  setExpandedHistory]  = useState(null);

  useEffect(() => {
    if (!athleteId) return;
    getDocs(query(
      collection(db, "athletes", athleteId, "technicalAssessments"),
      orderBy("date", "desc")
    ))
      .then(snap => setAssessments(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [athleteId]);

  // Group assessments by strokeArea, newest-first
  const byArea = {};
  assessments.forEach(a => {
    if (!byArea[a.strokeArea]) byArea[a.strokeArea] = [];
    byArea[a.strokeArea].push(a);
  });

  const openForm = (area = "") => {
    setFormArea(area || Object.values(STROKE_AREAS).flat()[0]);
    setFormDate(todayStr);
    setFormSource("Video Analysis");
    setFormText("");
    setFormPriority("Medium");
    setFormSchedule(true);
    setFormReviewDate(today6wk());
    setShowForm(true);
    setTimeout(() => document.getElementById("tech-form-top")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const handleSave = async () => {
    if (!formArea || !formText.trim() || !formDate) return;
    setFormSaving(true);
    const category = Object.entries(STROKE_AREAS).find(([, areas]) => areas.includes(formArea))?.[0] ?? "";
    const entry = {
      strokeArea:    formArea,
      category,
      date:          formDate,
      source:        formSource,
      assessment:    formText.trim().slice(0, 1500),
      priority:      formPriority,
      reviewDueDate: formSchedule ? formReviewDate : null,
      status:        "active",
    };
    try {
      const ref = await addDoc(collection(db, "athletes", athleteId, "technicalAssessments"), entry);
      const newEntry = { id: ref.id, ...entry };
      setAssessments(prev => [newEntry, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setShowForm(false);
    } catch (e) {
      console.error("Failed to save assessment:", e);
    }
    setFormSaving(false);
  };

  const priorityRank = { High: 2, Medium: 1, Monitor: 0 };
  const priorityColor = { High: COLORS.red, Medium: COLORS.yellow, Monitor: COLORS.accent };

  const changeIndicator = (entries) => {
    if (entries.length < 2) return null;
    const latestRank = priorityRank[entries[0].priority] ?? 1;
    const prevRank   = priorityRank[entries[1].priority] ?? 1;
    if (latestRank < prevRank) return { label: "Improving",  color: COLORS.accent };
    if (latestRank > prevRank) return { label: "Needs Work", color: COLORS.red    };
    return                           { label: "Unchanged",   color: COLORS.muted  };
  };

  const fmtDate = d => d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

  // Review-due areas (reviewDueDate <= today)
  const reviewDue = Object.entries(byArea)
    .filter(([, entries]) => entries[0]?.reviewDueDate && entries[0].reviewDueDate <= todayStr)
    .map(([area, entries]) => ({ area, lastDate: entries[0].date, reviewDueDate: entries[0].reviewDueDate }));

  const allAreas = Object.values(STROKE_AREAS).flat();

  if (loading) return <div className="card" style={{ textAlign: "center", padding: 32 }}><div className="spinner" /></div>;

  return (
    <div>
      {/* Log form */}
      <div id="tech-form-top" />
      {showForm ? (
        <div className="card" style={{ marginBottom: 16, border: `1px solid ${COLORS.accentDim}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="card-title" style={{ margin: 0 }}><FileText size={16} /> Log Assessment</div>
            <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: "1.1rem", lineHeight: 1 }}>✕</button>
          </div>

          <div className="grid2" style={{ marginBottom: 12 }}>
            <div>
              <div className="label">Stroke Area</div>
              <select value={formArea} onChange={e => setFormArea(e.target.value)}>
                {Object.entries(STROKE_AREAS).map(([cat, areas]) => (
                  <optgroup key={cat} label={cat}>
                    {areas.map(a => <option key={a} value={a}>{a}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <div className="label">Date</div>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
          </div>

          <div className="grid2" style={{ marginBottom: 12 }}>
            <div>
              <div className="label">Source</div>
              <select value={formSource} onChange={e => { setFormSource(e.target.value); setFormSchedule(e.target.value === "Video Analysis"); }}>
                {["Video Analysis", "Court Coach", "Match Observation", "Self"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div className="label">Priority</div>
              <select value={formPriority} onChange={e => setFormPriority(e.target.value)}>
                <option>High</option>
                <option>Medium</option>
                <option>Monitor</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="label">Assessment Notes ({formText.length}/1500)</div>
            <textarea
              placeholder="Paste video analysis notes, coaching observations, or assessment summary…"
              value={formText}
              onChange={e => setFormText(e.target.value.slice(0, 1500))}
              rows={5}
              style={{ width: "100%", resize: "vertical", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 12px", color: COLORS.text, fontFamily: "'DM Sans', sans-serif", fontSize: "0.88rem", lineHeight: 1.5, boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div className="label">Schedule Follow-Up Review?</div>
            <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.85rem" }}>
                <input type="radio" checked={!formSchedule} onChange={() => setFormSchedule(false)} /> No
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.85rem" }}>
                <input type="radio" checked={formSchedule} onChange={() => setFormSchedule(true)} /> Yes
              </label>
              {formSchedule && (
                <input type="date" value={formReviewDate} onChange={e => setFormReviewDate(e.target.value)}
                  style={{ marginLeft: 8 }} />
              )}
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={formSaving || !formArea || !formText.trim()}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {formSaving ? "Saving…" : "Save Assessment"}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => openForm()} style={{ width: "100%", justifyContent: "center", marginBottom: 16 }}>
          + Log Assessment
        </button>
      )}

      {/* Review due reminders */}
      {reviewDue.length > 0 && (
        <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid #3b82f6", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: "0.75rem", color: "#3b82f6", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            🎥 Reviews Due
          </div>
          {reviewDue.map(r => (
            <div key={r.area} style={{ fontSize: "0.82rem", color: COLORS.text, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
              <span>{r.area}</span>
              <span style={{ color: COLORS.muted }}>Last assessed {fmtDate(r.lastDate)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Not-yet-assessed reminders */}
      {(() => {
        const unassessed = allAreas.filter(a => !byArea[a]);
        if (!unassessed.length) return null;
        return (
          <div style={{ background: "rgba(90,106,126,0.08)", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: "0.75rem", color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              Not Yet Assessed ({unassessed.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {unassessed.map(a => (
                <span key={a} style={{ fontSize: "0.74rem", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: "2px 9px", color: COLORS.muted }}>{a}</span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Per-category sections */}
      {Object.entries(STROKE_AREAS).map(([cat, areas]) => (
        <div key={cat} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: COLORS.muted, marginBottom: 10, paddingLeft: 2 }}>
            {cat}
          </div>
          {areas.map(area => {
            const entries = byArea[area] || [];
            const latest  = entries[0] || null;
            const change  = changeIndicator(entries);
            const isDue   = latest?.reviewDueDate && latest.reviewDueDate <= todayStr;
            const isExpanded = expandedHistory === area;

            return (
              <div key={area} style={{
                background: COLORS.card, border: `1px solid ${isDue ? "#3b82f6" : COLORS.border}`,
                borderRadius: 10, marginBottom: 8, overflow: "hidden",
              }}>
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: latest ? 8 : 0 }}>
                    <div style={{ flex: 1, marginRight: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem", color: COLORS.text, marginBottom: 3 }}>{area}</div>
                      <div style={{ fontSize: "0.73rem", color: isDue ? "#3b82f6" : COLORS.muted }}>
                        {!latest    ? "Not yet assessed"
                          : isDue   ? `🎥 Review due — last assessed ${fmtDate(latest.date)}`
                          :           `Last assessed ${fmtDate(latest.date)}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      {latest && (
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: priorityColor[latest.priority] || COLORS.muted, background: `${priorityColor[latest.priority] || COLORS.muted}18`, whiteSpace: "nowrap" }}>
                          {latest.priority}
                        </span>
                      )}
                      {change && (
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: change.color, whiteSpace: "nowrap" }}>{change.label}</span>
                      )}
                    </div>
                  </div>

                  {latest?.assessment && (
                    <div style={{ fontSize: "0.79rem", color: COLORS.muted, lineHeight: 1.5, marginBottom: 10, borderLeft: `2px solid ${priorityColor[latest.priority] || COLORS.border}`, paddingLeft: 8 }}>
                      {latest.assessment.length > 160 ? latest.assessment.slice(0, 160) + "…" : latest.assessment}
                      {latest.source && <span style={{ fontSize: "0.7rem", color: COLORS.muted, marginLeft: 8 }}>— {latest.source}</span>}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: COLORS.accent, borderColor: COLORS.accentDim, fontSize: "0.76rem" }}
                      onClick={() => openForm(area)}
                    >
                      + Log Assessment
                    </button>
                    {entries.length >= 2 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: "0.76rem" }}
                        onClick={() => setExpandedHistory(isExpanded ? null : area)}
                      >
                        {isExpanded ? "Hide History" : `View History (${entries.length})`}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px", background: COLORS.surface }}>
                    <div style={{ fontSize: "0.7rem", color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Full History</div>
                    {entries.map((e, i) => (
                      <div key={e.id} style={{ marginBottom: i < entries.length - 1 ? 14 : 0, paddingBottom: i < entries.length - 1 ? 14 : 0, borderBottom: i < entries.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: COLORS.text }}>{fmtDate(e.date)}</span>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: "0.68rem", color: COLORS.muted }}>{e.source}</span>
                            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: priorityColor[e.priority] || COLORS.muted }}>{e.priority}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: COLORS.muted, lineHeight: 1.5 }}>{e.assessment}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── BENCHMARKS TAB ───────────────────────────────────────────────────────────
const STROKE_AREAS = {
  Groundstrokes: ["Forehand Drive", "Forehand Kinetic Chain", "Backhand Drive", "Backhand Kinetic Chain", "Forehand Slice", "Backhand Slice"],
  Serve:         ["First Serve", "Second Serve", "Serve Toss & Rhythm"],
  Return:        ["Forehand Return", "Backhand Return"],
  "Net Play":    ["Forehand Volley", "Backhand Volley", "Overhead", "Approach Shot"],
  Movement:      ["Split Step Timing", "Lateral Movement & Recovery", "First-Step Explosiveness", "Deceleration & Balance"],
  Specialty:     ["Drop Shot", "Lob", "Passing Shots"],
};

const FITNESS_TESTS = [
  { name: "5m Sprint",                    unit: "s",    lowerIsBetter: true  },
  { name: "10m Sprint",                   unit: "s",    lowerIsBetter: true  },
  { name: "Spider Run",                   unit: "s",    lowerIsBetter: true  },
  { name: "Standing Broad Jump",          unit: "cm",   lowerIsBetter: false },
  { name: "Single-Leg Broad Jump (Left)", unit: "cm",   lowerIsBetter: false },
  { name: "Single-Leg Broad Jump (Right)",unit: "cm",   lowerIsBetter: false },
  { name: "Overhead Med Ball Throw",      unit: "cm",   lowerIsBetter: false },
  { name: "Push-Up Max",                  unit: "reps", lowerIsBetter: false },
  { name: "Dead Hang",                    unit: "s",    lowerIsBetter: false },
  { name: "Single-Leg Squat (Left)",      unit: "reps", lowerIsBetter: false },
  { name: "Single-Leg Squat (Right)",     unit: "reps", lowerIsBetter: false },
  { name: "Plank Hold",                   unit: "s",    lowerIsBetter: false },
];

function BenchmarksTab({ athleteId, profile }) {
  // ── Fitness tests state ────────────────────────────────────────────────────
  const [ftEntries,    setFtEntries]    = useState([]);
  const [ftLoading,    setFtLoading]    = useState(true);
  const [ftTestName,   setFtTestName]   = useState(FITNESS_TESTS[0].name);
  const [ftResult,     setFtResult]     = useState("");
  const [ftDate,       setFtDate]       = useState(new Date().toISOString().split("T")[0]);
  const [ftNotes,      setFtNotes]      = useState("");
  const [ftSaving,     setFtSaving]     = useState(false);
  const [expandedTest, setExpandedTest] = useState(null);

  useEffect(() => {
    if (!athleteId) return;
    getDocs(query(
      collection(db, "athletes", athleteId, "benchmarks"),
      orderBy("date", "desc")
    ))
      .then(snap => setFtEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setFtLoading(false));
  }, [athleteId]);

  const handleFtSave = async () => {
    const val = parseFloat(ftResult);
    if (!val || val <= 0 || !ftTestName || !ftDate) return;
    setFtSaving(true);
    const testDef = FITNESS_TESTS.find(t => t.name === ftTestName);
    const entry = { testName: ftTestName, result: val, unit: testDef?.unit ?? "", date: ftDate, notes: ftNotes.trim() };
    try {
      const ref = await addDoc(collection(db, "athletes", athleteId, "benchmarks"), entry);
      setFtEntries(prev => [{ id: ref.id, ...entry }, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setFtResult(""); setFtNotes("");
    } catch (e) {
      console.error("Failed to save benchmark:", e);
    }
    setFtSaving(false);
  };

  // ── Maturity offset data ───────────────────────────────────────────────────
  const height        = parseFloat(profile?.height)        || null;
  const sittingHeight = parseFloat(profile?.sittingHeight) || null;
  const weight        = parseFloat(profile?.weight)        || null;
  const dob           = profile?.dob ? new Date(profile.dob) : null;
  const ageYears      = dob ? (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000) : null;

  let mirwald = null;
  if (height && sittingHeight && weight && ageYears) {
    const legLength = height - sittingHeight;
    const a = ageYears;
    const mo =
      -9.376
      + (0.0001882 * legLength * sittingHeight)
      + (0.0022    * a         * legLength)
      + (0.005841  * a         * sittingHeight)
      - (0.002658  * a         * weight)
      + (0.07693   * (weight / height) * 100);
    mirwald = Math.round(mo * 100) / 100;
  }

  const phvStage = mirwald === null ? null
    : mirwald < -1  ? "Pre-PHV"
    : mirwald <= 1  ? "Mid-PHV"
    : "Post-PHV";

  const phvColor = phvStage === "Pre-PHV"  ? COLORS.accent
    : phvStage === "Mid-PHV"  ? COLORS.yellow
    : COLORS.cheer;

  const implications = {
    "Pre-PHV":  "Foundation phase — emphasise fundamental movement skills, coordination, and technical quality. Growth plates are open; avoid heavy axial loading. Light resistance and bodyweight work are appropriate.",
    "Mid-PHV":  "Rapid growth phase — most sensitive period for injury. Reduce high-impact and plyometric volume. Monitor flexibility closely as bone growth outpaces muscle length. Prioritise injury prevention and movement quality over performance.",
    "Post-PHV": "Post-growth phase — progressive loading becomes more appropriate. Strength training gains accelerate. Can begin building structured resistance load while maintaining technical standards.",
  };

  const missing = [];
  if (!height)        missing.push("standing height");
  if (!sittingHeight) missing.push("sitting height");
  if (!weight)        missing.push("weight");
  if (!dob)           missing.push("date of birth");

  return (
    <div>
      <div className="card">
        <div className="card-title"><TrendingUp size={18} /> Maturity Assessment</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 16 }}>
          Mirwald maturity offset estimates years to/from Peak Height Velocity (PHV) — the point of fastest growth. Used to calibrate training load and injury risk.
        </p>

        {missing.length > 0 ? (
          <div className="note-box" style={{ borderColor: COLORS.yellow, background: "rgba(245,197,24,0.07)" }}>
            <span style={{ color: COLORS.yellow, fontWeight: 600 }}>Missing data: </span>
            <span style={{ color: COLORS.text }}>
              {missing.join(", ")} — enter in the Profile tab to enable this calculation.
            </span>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{
                flex: 1, minWidth: 120, background: COLORS.surface, borderRadius: 10,
                padding: "14px 16px", textAlign: "center",
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Maturity Offset</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.4rem", color: mirwald >= 0 ? COLORS.accent : COLORS.yellow, lineHeight: 1 }}>
                  {mirwald >= 0 ? "+" : ""}{mirwald}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>years from PHV</div>
              </div>

              <div style={{
                flex: 1, minWidth: 120, background: COLORS.surface, borderRadius: 10,
                padding: "14px 16px", textAlign: "center",
                border: `2px solid ${phvColor}`,
              }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>PHV Stage</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: phvColor, lineHeight: 1.1 }}>
                  {phvStage}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>
                  {phvStage === "Pre-PHV"  && "approaching peak growth"}
                  {phvStage === "Mid-PHV"  && "in peak growth window"}
                  {phvStage === "Post-PHV" && "past peak growth"}
                </div>
              </div>

              <div style={{
                flex: 1, minWidth: 120, background: COLORS.surface, borderRadius: 10,
                padding: "14px 16px", textAlign: "center",
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Age</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.4rem", color: COLORS.text, lineHeight: 1 }}>
                  {Math.floor(ageYears)}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>years old</div>
              </div>
            </div>

            <div style={{
              borderLeft: `3px solid ${phvColor}`,
              paddingLeft: 12, marginBottom: 16,
            }}>
              <div style={{ fontSize: "0.75rem", color: phvColor, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Training Implication — {phvStage}
              </div>
              <div style={{ fontSize: "0.83rem", color: COLORS.text, lineHeight: 1.6 }}>
                {implications[phvStage]}
              </div>
            </div>

            <div style={{ background: COLORS.surface, borderRadius: 8, padding: "10px 14px", fontSize: "0.78rem", color: COLORS.muted }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Standing height</span><span style={{ color: COLORS.text }}>{height} cm</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Sitting height</span><span style={{ color: COLORS.text }}>{sittingHeight} cm</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Leg length (standing − sitting)</span><span style={{ color: COLORS.text }}>{Math.round((height - sittingHeight) * 10) / 10} cm</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Weight</span><span style={{ color: COLORS.text }}>{weight} kg</span>
              </div>
            </div>

            <div className="note-box mt16">
              💡 Re-measure monthly and update Profile to track maturity progression over time.
            </div>
          </>
        )}
      </div>

      {/* ── Fitness Tests ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title"><Activity size={18} /> Fitness Tests</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 16 }}>
          Log standardised fitness tests to track physical development over time. Aim to retest every 6–8 weeks.
        </p>

        {/* Log form */}
        <div style={{ background: COLORS.surface, borderRadius: 10, padding: "14px", marginBottom: 20 }}>
          <div style={{ fontSize: "0.75rem", color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Log New Result</div>
          <div className="grid2" style={{ marginBottom: 10 }}>
            <div>
              <div className="label">Test</div>
              <select value={ftTestName} onChange={e => setFtTestName(e.target.value)}>
                {FITNESS_TESTS.map(t => <option key={t.name} value={t.name}>{t.name} ({t.unit})</option>)}
              </select>
            </div>
            <div>
              <div className="label">Result ({FITNESS_TESTS.find(t => t.name === ftTestName)?.unit})</div>
              <input
                type="number" placeholder="e.g. 1.85" step="0.01" min="0"
                value={ftResult} onChange={e => setFtResult(e.target.value)}
              />
            </div>
          </div>
          <div className="grid2" style={{ marginBottom: 10 }}>
            <div>
              <div className="label">Date</div>
              <input type="date" value={ftDate} onChange={e => setFtDate(e.target.value)} />
            </div>
            <div>
              <div className="label">Notes (optional)</div>
              <input placeholder="e.g. slightly fatigued" value={ftNotes} onChange={e => setFtNotes(e.target.value)} />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleFtSave}
            disabled={ftSaving || !parseFloat(ftResult) || !ftDate}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {ftSaving ? "Saving…" : "Save Result"}
          </button>
        </div>

        {ftLoading ? (
          <div style={{ textAlign: "center", padding: 20 }}><div className="spinner" /></div>
        ) : (() => {
          const cutoff56 = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

          // Group entries by test name, sorted newest-first per test
          const byTest = {};
          ftEntries.forEach(e => {
            if (!byTest[e.testName]) byTest[e.testName] = [];
            byTest[e.testName].push(e);
          });

          // Overdue / never tested reminders
          const reminders = FITNESS_TESTS.filter(t => {
            const entries = byTest[t.name];
            if (!entries?.length) return true;
            return entries[0].date < cutoff56;
          });

          const fmtDate = d => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

          return (
            <>
              {reminders.length > 0 && (
                <div style={{ background: "rgba(245,197,24,0.07)", border: `1px solid ${COLORS.yellow}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                  <div style={{ fontSize: "0.75rem", color: COLORS.yellow, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Overdue / Not Yet Recorded
                  </div>
                  {reminders.map(t => {
                    const last = byTest[t.name]?.[0];
                    return (
                      <div key={t.name} style={{ fontSize: "0.8rem", color: COLORS.text, marginBottom: 4 }}>
                        {last
                          ? <><span style={{ color: COLORS.yellow }}>Overdue:</span> {t.name} — last tested {fmtDate(last.date)}</>
                          : <><span style={{ color: COLORS.muted }}>Not yet recorded:</span> {t.name}</>
                        }
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Per-test result cards */}
              {FITNESS_TESTS.map(testDef => {
                const entries = byTest[testDef.name] || [];
                if (!entries.length) return null;
                const latest = entries[0];
                const prev   = entries[1] || null;
                const delta  = prev ? Math.round((latest.result - prev.result) * 100) / 100 : null;
                const improved = delta === null ? null
                  : testDef.lowerIsBetter ? delta < 0 : delta > 0;
                const isExpanded = expandedTest === testDef.name;

                return (
                  <div key={testDef.name} style={{
                    background: COLORS.surface, borderRadius: 10,
                    border: `1px solid ${COLORS.border}`, marginBottom: 10, overflow: "hidden",
                  }}>
                    <div
                      style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                      onClick={() => setExpandedTest(isExpanded ? null : testDef.name)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>{testDef.name}</div>
                        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem", color: COLORS.accent, lineHeight: 1 }}>
                            {latest.result}<span style={{ fontSize: "0.7rem", fontFamily: "'DM Sans', sans-serif", color: COLORS.muted, marginLeft: 2 }}>{testDef.unit}</span>
                          </span>
                          {prev && (
                            <span style={{ fontSize: "0.78rem", color: COLORS.muted }}>
                              prev: {prev.result} {testDef.unit}
                            </span>
                          )}
                          {delta !== null && (
                            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: improved ? COLORS.accent : COLORS.red }}>
                              {improved ? "↑" : "↓"} {Math.abs(delta)} {testDef.unit}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ color: COLORS.muted, fontSize: "0.75rem", marginLeft: 8 }}>{isExpanded ? "▲" : "▼"}</span>
                    </div>

                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "10px 14px" }}>
                        <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>History</div>
                        {entries.map((e, i) => (
                          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: i < entries.length - 1 ? 6 : 0, marginBottom: i < entries.length - 1 ? 6 : 0, borderBottom: i < entries.length - 1 ? `1px solid ${COLORS.border}` : "none", fontSize: "0.8rem" }}>
                            <span style={{ color: COLORS.muted }}>{fmtDate(e.date)}</span>
                            <span style={{ fontWeight: 600, color: COLORS.text }}>{e.result} {testDef.unit}</span>
                            {e.notes && <span style={{ color: COLORS.muted, fontStyle: "italic", fontSize: "0.74rem", maxWidth: 120, textAlign: "right" }}>{e.notes}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {ftEntries.length === 0 && (
                <div className="empty">No fitness tests logged yet. Use the form above to record the first result.</div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

