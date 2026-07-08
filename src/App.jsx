import { useState, useEffect, useCallback } from "react";
import {
  ClipboardCheck, ClipboardList,
  Dumbbell, FileText, History,
  Settings, Target, TrendingUp,
  Users,
} from "lucide-react";
import { auth, db } from "./firebase";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, addDoc, deleteDoc,
  collection, getDocs, query, orderBy, limit,
} from "firebase/firestore";
import { refreshEscalations } from "./lib/deferredPriorities.js";
import { toLocalDateStr } from "./lib/dates.js";
import { mergeWellbeingByDate, calculateMetrics } from "./lib/load.js";
import { COLORS, css } from "./styles/theme.js";
import AthleteView from "./athlete/AthleteView.jsx";
import PlanTab from "./tabs/PlanTab.jsx";
import LogTab from "./tabs/LogTab.jsx";
import StrengthLogTab from "./tabs/StrengthLogTab.jsx";
import ProfileTab from "./tabs/ProfileTab.jsx";
import MatchesTab from "./tabs/MatchesTab.jsx";
import PrioritiesTab from "./tabs/PrioritiesTab.jsx";
import TechnicalTab from "./tabs/TechnicalTab.jsx";
import BenchmarksTab from "./tabs/BenchmarksTab.jsx";

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

