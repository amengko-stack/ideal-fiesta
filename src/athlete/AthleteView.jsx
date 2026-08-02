import { useState, useEffect, lazy, Suspense } from "react";
import {
  ClipboardList, Heart, Sprout, Target, MessageSquare,
} from "lucide-react";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { COLORS, css } from "../styles/theme.js";
import { identityChipText } from "../lib/athleteIdentity.js";

const AVLogSession = lazy(() => import("./AVLogSession.jsx"));
const AVWellbeing  = lazy(() => import("./AVWellbeing.jsx"));
const AVGrowth     = lazy(() => import("./AVGrowth.jsx"));
const AVMatchNotes = lazy(() => import("./AVMatchNotes.jsx"));
const AVPlan       = lazy(() => import("./AVPlan.jsx"));

// ─── ATHLETE VIEW (mobile-first) ─────────────────────────────────────────────
export default function AthleteView({ athleteId, user, onSignOut }) {
  const [section, setSection]     = useState("log");
  const [currentPlan, setPlan]    = useState(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [profile, setProfile]     = useState(null);

  useEffect(() => {
    getDoc(doc(db, "athletes", athleteId, "plans", "current"))
      .then(snap => { if (snap.exists()) setPlan(snap.data()); })
      .catch(e => console.error("Load plan error:", e))
      .finally(() => setPlanLoading(false));
    getDoc(doc(db, "athletes", athleteId))
      .then(snap => { if (snap.exists()) setProfile(snap.data()); })
      .catch(e => console.error("Load profile error:", e));
  }, [athleteId]);

  const NAV = [
    { id: "log",       Icon: ClipboardList, label: "Log Session" },
    { id: "wellbeing", Icon: Heart,         label: "Wellbeing"   },
    { id: "growth",    Icon: Sprout,        label: "My Growth"   },
    { id: "plan",      Icon: Target,        label: "My Plan"     },
    { id: "notes",     Icon: MessageSquare, label: "Match Notes" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg }}>
      <style>{css}</style>

      <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(1.2rem, 4vw, 1.5rem)", color: COLORS.accent, lineHeight: 1, letterSpacing: "0.06em" }}>Performance Tracker</h1>
          <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { label: user?.displayName?.split(" ")[0] || "Athlete", color: COLORS.accent, bg: COLORS.accentMuted },
            { label: identityChipText(profile), color: COLORS.muted, bg: COLORS.surface },
            { label: "Tennis", color: COLORS.tennis, bg: "rgba(200,245,100,0.1)" },
            { label: "Cross-Training", color: COLORS.yellow, bg: "rgba(245,197,24,0.1)" },
            { label: "Athlete View", color: COLORS.yellow, bg: "rgba(245,197,24,0.12)" },
          ].map(chip => (
            <span key={chip.label} style={{ fontSize: "0.65rem", fontWeight: 600, padding: "2px 7px", borderRadius: 20, color: chip.color, background: chip.bg, whiteSpace: "nowrap" }}>{chip.label}</span>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 16px 110px", maxWidth: 480, margin: "0 auto" }}>
        <Suspense fallback={<div className="empty">Loading…</div>}>
          {section === "log"       && <AVLogSession  athleteId={athleteId} profile={profile} />}
          {section === "wellbeing" && <AVWellbeing   athleteId={athleteId} />}
          {section === "growth"    && <AVGrowth      athleteId={athleteId} />}
          {section === "plan"      && <AVPlan plan={currentPlan} loading={planLoading} />}
          {section === "notes"     && <AVMatchNotes  athleteId={athleteId} />}
        </Suspense>
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: COLORS.surface, borderTop: `1px solid ${COLORS.border}`,
        display: "flex", zIndex: 100,
      }}>
        {NAV.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            style={{
              flex: 1, padding: "12px 4px 20px", border: "none",
              background: "transparent",
              color: section === s.id ? COLORS.accent : COLORS.muted,
              fontFamily: "'DM Sans', sans-serif", fontSize: "0.65rem", fontWeight: 600,
              cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 5, transition: "color 0.15s",
            }}
          >
            <s.Icon size={22} strokeWidth={1.75} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
