import { useState, useEffect } from "react";
import {
  doc, setDoc, collection, getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { refreshEscalations } from "../lib/deferredPriorities.js";
import { toLocalDateStr } from "../lib/dates.js";
import { mergeWellbeingByDate, calculateMetrics } from "../lib/load.js";
import { COLORS } from "../styles/theme.js";

// ─── ALERTS BANNER ────────────────────────────────────────────────────────────
export default function AlertsBanner({ athleteId, wellbeing, sessionHistory, weekLogs }) {
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
