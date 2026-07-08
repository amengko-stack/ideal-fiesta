import { COLORS } from "../styles/theme.js";

// ─── AV: MY PLAN (read-only) ──────────────────────────────────────────────────
export default function AVPlan({ plan, loading }) {
  if (loading) return <div className="empty" style={{ paddingTop: 60 }}><div className="spinner" /></div>;

  if (!plan) return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 20 }}>My Plan</div>
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🎯</div>
        <div style={{ color: COLORS.muted, fontSize: "0.9rem", lineHeight: 1.6 }}>No plan yet.<br />Your coach will generate one for you.</div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 4 }}>My Plan</div>
      {plan.generatedAt && (
        <div style={{ fontSize: "0.75rem", color: COLORS.muted, marginBottom: 16 }}>
          Generated {new Date(plan.generatedAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </div>
      )}

      {plan.briefing && (
        <div className="card" style={{ borderColor: COLORS.accentDim, marginBottom: 16 }}>
          <div style={{ fontSize: "0.72rem", color: COLORS.accentDim, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Coach's Note</div>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.7, color: COLORS.text }}>{plan.briefing}</p>
        </div>
      )}

      {(plan.plan || []).map((ex, i) => (
        <div
          key={i}
          style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 14, padding: "16px", marginBottom: 10,
            display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 6 }}>{ex.name}</div>
            <span className="badge badge-gray">{ex.category}</span>
            {ex.note && <div style={{ fontSize: "0.78rem", color: COLORS.accentDim, marginTop: 8, lineHeight: 1.5 }}>→ {ex.note}</div>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", color: COLORS.accent, lineHeight: 1 }}>
              {ex.sets}×{ex.reps}{ex.unit === "seconds" ? "s" : ""}
            </div>
            <div style={{ fontSize: "0.65rem", color: COLORS.muted, marginTop: 2 }}>
              sets × {ex.unit === "seconds" ? "sec" : ex.unit || "reps"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
