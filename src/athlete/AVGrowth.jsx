import { useState, useEffect } from "react";
import { Ruler } from "lucide-react";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toLocalDateStr } from "../lib/dates.js";
import { COLORS } from "../styles/theme.js";

function StatBubble({ label, value, unit, color }) {
  return (
    <div style={{
      flex: 1, background: COLORS.card, border: `1px solid ${COLORS.border}`,
      borderRadius: 16, padding: "20px 12px", textAlign: "center",
    }}>
      <div style={{ fontSize: "0.72rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      {value
        ? <>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "3rem", color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: "0.8rem", color: COLORS.muted, marginTop: 2 }}>{unit}</div>
          </>
        : <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.6rem", color: COLORS.muted, lineHeight: 1 }}>—</div>
      }
    </div>
  );
}

// ─── AV: GROWTH TAB ──────────────────────────────────────────────────────────
export default function AVGrowth({ athleteId }) {
  const [measurements, setMeasurements] = useState([]);
  const [weight, setWeight]             = useState("");
  const [height, setHeight]             = useState("");
  const [sittingHeight, setSittingHeight] = useState("");
  const [saving, setSaving]             = useState(false);
  const [celebration, setCelebration]   = useState(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    getDoc(doc(db, "athletes", athleteId))
      .then(snap => {
        if (snap.exists()) setMeasurements(snap.data().measurements || []);
      })
      .catch(e => console.error("Load measurements error:", e))
      .finally(() => setLoading(false));
  }, [athleteId]);

  const getCelebration = (current, prev) => {
    if (!prev) return {
      emoji: "📏", color: COLORS.accent,
      title: "First measurement logged!",
      msg: "This is Day 1 of tracking your athletic growth. Your AI coach will use this to build smarter plans just for you. Let's go! 🚀",
    };
    const hDiff = (current.height && prev.height) ? +(current.height - prev.height).toFixed(1) : 0;
    const wDiff = (current.weight && prev.weight) ? +(current.weight - prev.weight).toFixed(1) : 0;
    const parts = [];
    if (hDiff > 0) parts.push(`You grew ${hDiff}cm taller! 🌱 Every centimetre gives you a longer lever — more reach, more power on that serve.`);
    if (wDiff > 0) parts.push(`Up ${wDiff}kg! 💪 That's not just weight — that's muscle and strength loading up for the court and the mat.`);
    if (parts.length > 0) return {
      emoji: "🎉", color: COLORS.yellow,
      title: "You're growing, athlete!",
      msg: parts.join(" "),
    };
    if (hDiff < 0 || wDiff < 0) return {
      emoji: "📊", color: COLORS.accent,
      title: "Logged!",
      msg: "Every data point makes your AI coach smarter. Keep showing up — growth happens in waves.",
    };
    return {
      emoji: "🔒", color: COLORS.accentDim,
      title: "Rock solid!",
      msg: "No change this time — your body is locked in, building strength and speed under the surface. Stay consistent!",
    };
  };

  const handleSave = async () => {
    const w  = parseFloat(weight);
    const h  = parseFloat(height);
    const sh = parseFloat(sittingHeight);
    if ((!w || w <= 0) && (!h || h <= 0) && (!sh || sh <= 0)) return;
    setSaving(true);
    const today = toLocalDateStr(new Date());
    const entry = { date: today };
    if (w  > 0) entry.weight        = w;
    if (h  > 0) entry.height        = h;
    if (sh > 0) entry.sittingHeight = sh;
    const prev = measurements.filter(m => m.date !== today);
    const updated = [entry, ...prev].slice(0, 12);
    await setDoc(doc(db, "athletes", athleteId), {
      measurements: updated,
      weight:        w  > 0 ? w  : (measurements[0]?.weight        || null),
      height:        h  > 0 ? h  : (measurements[0]?.height        || null),
      sittingHeight: sh > 0 ? sh : (measurements[0]?.sittingHeight || null),
    }, { merge: true });
    const prevEntry = measurements.find(m => m.date !== today) || null;
    setCelebration(getCelebration(entry, prevEntry));
    setMeasurements(updated);
    setWeight(""); setHeight(""); setSittingHeight("");
    setSaving(false);
  };

  const latest = measurements[0] || null;

  if (loading) return <div className="empty" style={{ paddingTop: 60 }}><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: COLORS.text, marginBottom: 4 }}>My Growth</div>
      <div style={{ fontSize: "0.8rem", color: COLORS.muted, marginBottom: 20 }}>Track your height, sitting height, and weight. Every measurement helps your AI coach plan smarter for you.</div>

      {/* Current stats hero */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <StatBubble label="Height" value={latest?.height} unit="cm" color={COLORS.tennis} />
        <StatBubble label="Sitting Ht" value={latest?.sittingHeight} unit="cm" color={COLORS.yellow} />
        <StatBubble label="Weight" value={latest?.weight} unit="kg" color={COLORS.accent} />
      </div>
      {latest && (
        <div style={{ textAlign: "center", color: COLORS.muted, fontSize: "0.72rem", marginTop: -18, marginBottom: 20 }}>
          Last logged {latest.date}
        </div>
      )}

      {/* Celebration card */}
      {celebration && (
        <div style={{
          background: `${celebration.color}18`,
          border: `2px solid ${celebration.color}`,
          borderRadius: 16, padding: "18px 20px", marginBottom: 24, textAlign: "center",
        }}>
          <div style={{ fontSize: "2.4rem", marginBottom: 8 }}>{celebration.emoji}</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: celebration.color, marginBottom: 8 }}>{celebration.title}</div>
          <div style={{ fontSize: "0.88rem", color: COLORS.text, lineHeight: 1.6 }}>{celebration.msg}</div>
        </div>
      )}

      {/* Log new measurement */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "20px 16px", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.1rem", color: COLORS.accent, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}><Ruler size={16} /> Log New Measurement</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="av-big-label">Height (cm)</div>
              <input
                name="height"
                type="number" placeholder="e.g. 155" min="100" max="220" step="0.5"
                value={height} onChange={e => setHeight(e.target.value)}
                style={{ fontSize: "1.1rem", padding: "13px 14px" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="av-big-label">Weight (kg)</div>
              <input
                name="weight"
                type="number" placeholder="e.g. 42" min="20" max="120" step="0.1"
                value={weight} onChange={e => setWeight(e.target.value)}
                style={{ fontSize: "1.1rem", padding: "13px 14px" }}
              />
            </div>
          </div>
          <div>
            <div className="av-big-label">Sitting Height (cm)</div>
            <input
              name="sittingHeight"
              type="number" placeholder="e.g. 82" min="50" max="130" step="0.5"
              value={sittingHeight} onChange={e => setSittingHeight(e.target.value)}
              style={{ fontSize: "1.1rem", padding: "13px 14px" }}
            />
            <div style={{ fontSize: "0.75rem", color: COLORS.muted, marginTop: 6, lineHeight: 1.4 }}>
              Sit straight against a wall — measure from seat to top of head.
            </div>
          </div>
        </div>
        <div className="av-hint" style={{ marginBottom: 14 }}>Log what you have — height, sitting height, weight, or all three.</div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || (!parseFloat(weight) && !parseFloat(height) && !parseFloat(sittingHeight))}
          style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: "1rem" }}
        >
          {saving ? "Saving…" : "Save Measurement 🌱"}
        </button>
      </div>

      {/* Growth history */}
      {measurements.length > 0 && (
        <div>
          <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Growth History</div>
          {measurements.slice(0, 6).map((m, i) => {
            const prev = measurements[i + 1];
            const hDiff = (m.height && prev?.height) ? +(m.height - prev.height).toFixed(1) : null;
            const wDiff = (m.weight && prev?.weight) ? +(m.weight - prev.weight).toFixed(1) : null;
            return (
              <div key={i} style={{
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 12, padding: "14px 16px", marginBottom: 10,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginBottom: 4 }}>{m.date}</div>
                  <div style={{ display: "flex", gap: 14 }}>
                    {m.height        && <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.tennis }}>{m.height}<span style={{ fontSize: "0.7rem", color: COLORS.muted, fontFamily: "'DM Sans', sans-serif" }}> cm</span></span>}
                    {m.sittingHeight && <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.yellow }}>{m.sittingHeight}<span style={{ fontSize: "0.7rem", color: COLORS.muted, fontFamily: "'DM Sans', sans-serif" }}> sit</span></span>}
                    {m.weight        && <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.accent }}>{m.weight}<span style={{ fontSize: "0.7rem", color: COLORS.muted, fontFamily: "'DM Sans', sans-serif" }}> kg</span></span>}
                  </div>
                </div>
                {(hDiff !== null || wDiff !== null) && (
                  <div style={{ textAlign: "right" }}>
                    {hDiff !== null && <div style={{ fontSize: "0.78rem", color: hDiff > 0 ? COLORS.tennis : COLORS.muted, fontWeight: 600 }}>{hDiff > 0 ? `+${hDiff}` : hDiff} cm</div>}
                    {wDiff !== null && <div style={{ fontSize: "0.78rem", color: wDiff > 0 ? COLORS.accent : COLORS.muted, fontWeight: 600 }}>{wDiff > 0 ? `+${wDiff}` : wDiff} kg</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {measurements.length === 0 && !celebration && (
        <div style={{ textAlign: "center", padding: "32px 20px", color: COLORS.muted }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🌱</div>
          <div style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>No measurements yet.<br />Log your first one above and start tracking your athletic journey!</div>
        </div>
      )}
    </div>
  );
}
