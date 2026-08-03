import { useState, useEffect } from "react";
import {
  doc, setDoc, collection, getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { getEscalated } from "../lib/deferredPriorities.js";
import { dueReminders } from "../lib/reminders.js";
import { COLORS } from "../styles/theme.js";

// ─── ALERTS BANNER ────────────────────────────────────────────────────────────
// Uses the same dueReminders() engine as MobileApp.jsx so the classic and
// mobile apps can never drift on what counts as an alert again. This
// component still does its own Firestore reads (benchmarks/tournaments/
// technicalAssessments/priorities aren't passed in as props here) to assemble
// the `state` the pure engine needs — those reads are fine, they just must
// never write. `refreshEscalations` used to be called here for priorities,
// but it also PROMOTES items to "escalated" (a write) — a read path must
// never mutate, so this uses the read-only `getEscalated` instead.
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
      } catch { /* a failed read just means nothing is dismissed yet */ }
      if (cancelled) return;
      setDismissed(dismissedMap);

      const [
        benchmarksSnap, tournamentsSnap, technicalSnap, escalated,
      ] = await Promise.all([
        getDocs(collection(db, "athletes", athleteId, "benchmarks")).catch(() => null),
        getDocs(collection(db, "athletes", athleteId, "tournaments")).catch(() => null),
        getDocs(collection(db, "athletes", athleteId, "technicalAssessments")).catch(() => null),
        getEscalated(athleteId).catch(() => []),
      ]);
      if (cancelled) return;

      const benchmarks  = benchmarksSnap  ? benchmarksSnap.docs.map(d => d.data())  : [];
      const tournaments = tournamentsSnap ? tournamentsSnap.docs.map(d => d.data()) : [];
      const technical   = technicalSnap   ? technicalSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];

      const reminders = dueReminders(
        {
          weekLogs, wellbeing, sessions: sessionHistory,
          tournaments, technical, benchmarks,
          priorities: escalated, // already-escalated only, matching what this banner used to show
          injuries: [],          // this banner doesn't load injuries; MobileApp's alert set covers that
        },
        new Date()
      );

      // Map engine tone -> this component's existing red/orange/blue/gray
      // severity scheme. No check currently emits anything but danger/warn/
      // info, so "gray" is unused here (kept only so severityStyle below still
      // has a safe fallback for any future muted/no-tone case).
      const toneToSeverity = { danger: "red", warn: "orange", info: "blue" };
      const flat = reminders.map(r => ({
        id: r.id, severity: toneToSeverity[r.tone] || "gray",
        title: r.title, body: r.body,
      }));

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
    } catch { /* the alert stays dismissed locally; it'll reappear next load */ }
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
