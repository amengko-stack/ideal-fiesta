import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { toLocalDateStr } from "../lib/dates.js";

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };
const input = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1.5px solid #D6E2DB",
  borderRadius: 12, background: M.card, fontFamily: M.display, fontWeight: 600,
  fontSize: 14, color: M.ink, outline: "none", marginBottom: 18,
};

// Same save semantics as the classic AVGrowth: one measurements entry per day
// (same-day re-save replaces), history kept in full, with top-level convenience fields.
export default function GrowthSheet({ athleteId, measurements, onSaved, onClose }) {
  const [height, setHeight]               = useState("");
  const [weight, setWeight]               = useState("");
  const [sittingHeight, setSittingHeight] = useState("");
  const [saving, setSaving]               = useState(false);

  const save = () => {
    if (saving) return;
    const h  = parseFloat(height);
    const w  = parseFloat(weight);
    const sh = parseFloat(sittingHeight);
    if ((!h || h <= 0) && (!w || w <= 0) && (!sh || sh <= 0)) {
      onSaved("Enter at least one measurement 📏");
      return;
    }
    setSaving(true);
    const today = toLocalDateStr(new Date());
    const entry = { date: today };
    if (h  > 0) entry.height        = h;
    if (w  > 0) entry.weight        = w;
    if (sh > 0) entry.sittingHeight = sh;
    const existing = measurements || [];
    const prev = existing.filter(m => m.date !== today);
    const updated = [entry, ...prev];
    // Fire-and-forget: local commit is instant; syncs when online.
    setDoc(doc(db, "athletes", athleteId), {
      measurements: updated,
      height:        h  > 0 ? h  : (existing[0]?.height        || null),
      weight:        w  > 0 ? w  : (existing[0]?.weight        || null),
      sittingHeight: sh > 0 ? sh : (existing[0]?.sittingHeight || null),
    }, { merge: true }).catch(e => console.error("GrowthSheet save:", e));

    const prevHeight = prev.find(m => m.height != null)?.height;
    const grew = h > 0 && prevHeight != null && h > prevHeight;
    onSaved(grew ? `You grew ${(h - prevHeight).toFixed(1)}cm! 🌱` : "Measurement logged 📏");
    onClose();
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 6 }}>Log measurements 📏</div>
      <div style={{ fontSize: 13, color: M.sub, marginBottom: 16, lineHeight: 1.45 }}>
        Fill in whichever you measured today — height feeds the growth chart and helps tune training load.
      </div>
      <div style={label}>Height (cm)</div>
      <input type="number" inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 152" style={input} />
      <div style={label}>Weight (kg)</div>
      <input type="number" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 41" style={input} />
      <div style={label}>Sitting height (cm)</div>
      <input type="number" inputMode="decimal" value={sittingHeight} onChange={e => setSittingHeight(e.target.value)} placeholder="e.g. 80" style={input} />
      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16, padding: 16,
        textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 16, boxShadow: M.cta,
        opacity: saving ? 0.6 : 1,
      }}>Save measurements 🌱</div>
    </>
  );
}
