import { useState } from "react";
import { doc, collection, addDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { toLocalDateStr } from "../lib/dates.js";
import { BODY_AREAS, SIDES, SEVERITY_LABELS } from "../lib/injuries.js";

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };
const input = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1.5px solid #D6E2DB",
  borderRadius: 12, background: M.card, fontFamily: M.display, fontWeight: 600,
  fontSize: 14, color: M.ink, outline: "none", marginBottom: 18,
};

// Bottom-sheet form matching GrowthSheet/BenchmarkSheet. `editing` (an open
// injury doc) switches this into resolve mode instead of a fresh log.
export default function InjurySheet({ athleteId, editing, onSaved, onClose }) {
  const [bodyArea, setBodyArea] = useState(editing?.bodyArea || "");
  const [side, setSide]         = useState(editing?.side || "N/A");
  const [severity, setSeverity] = useState(editing?.severity || 2);
  const [onsetDate, setOnsetDate] = useState(editing?.onsetDate || toLocalDateStr(new Date()));
  const [notes, setNotes]       = useState(editing?.notes || "");
  const [timeLossDays, setTimeLossDays] = useState(editing?.timeLossDays ? String(editing.timeLossDays) : "");
  const [resolvedDate, setResolvedDate] = useState(toLocalDateStr(new Date()));
  const [saving, setSaving]     = useState(false);

  // The editable fields, shared by the update and resolve paths so that
  // resolving an injury can't silently discard a severity change made in the
  // same visit.
  const editedFields = () => ({
    bodyArea, side, severity,
    notes: notes.trim(),
    timeLossDays: parseFloat(timeLossDays) || 0,
  });

  const save = () => {
    if (saving) return;
    if (!bodyArea) {
      onSaved("Pick where it hurts first 🩹");
      return;
    }
    setSaving(true);

    // Editing an existing injury updates it in place. Adding a second document
    // instead would leave two open injuries for one sore knee, double-counting
    // it in injuryLoadFlag and faking a recurrence.
    if (editing) {
      updateDoc(doc(db, "athletes", athleteId, "injuries", editing.id), editedFields())
        .catch(e => console.error("InjurySheet update:", e));
      onSaved(`${bodyArea} updated 🩹`);
      onClose();
      return;
    }

    addDoc(collection(db, "athletes", athleteId, "injuries"), {
      ...editedFields(),
      status: "open",
      onsetDate,
      resolvedDate: null,
      createdAt: new Date().toISOString(),
    }).catch(e => console.error("InjurySheet save:", e));
    onSaved(`${bodyArea} niggle logged 🩹`);
    onClose();
  };

  const resolve = () => {
    if (saving || !editing) return;
    setSaving(true);
    updateDoc(doc(db, "athletes", athleteId, "injuries", editing.id), {
      ...editedFields(),
      status: "resolved", resolvedDate,
    }).catch(e => console.error("InjurySheet resolve:", e));
    onSaved(`${editing.bodyArea} marked resolved 🎉`);
    onClose();
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 6 }}>
        {editing ? `${editing.bodyArea} update 🩹` : "Log an injury / niggle 🩹"}
      </div>
      <div style={{ fontSize: 13, color: M.sub, marginBottom: 16, lineHeight: 1.45 }}>
        Even a small niggle matters — this is what lets the plan and the AI take it easy on the area that needs it.
      </div>

      {editing && (
        <div onClick={resolve} style={{
          cursor: "pointer", marginBottom: 18, textAlign: "center", padding: 13, borderRadius: 14,
          background: M.fill, color: M.success, fontFamily: M.display, fontWeight: 700, fontSize: 13.5,
          opacity: saving ? 0.6 : 1,
        }}>✓ Mark as resolved</div>
      )}

      <div style={label}>Where does it hurt?</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {BODY_AREAS.map(a => {
          const sel = bodyArea === a;
          return (
            <div key={a} onClick={() => setBodyArea(a)} style={{
              cursor: "pointer", padding: "9px 13px", borderRadius: 12, fontFamily: M.display,
              fontWeight: 700, fontSize: 12.5, whiteSpace: "nowrap",
              background: sel ? M.gradient : M.fillAlt, color: sel ? M.deepGreen : "#5f7168",
              boxShadow: sel ? `0 3px 0 ${M.brandShadow}` : "none",
            }}>{a}</div>
          );
        })}
      </div>

      <div style={label}>Which side?</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {SIDES.map(s => {
          const sel = side === s;
          return (
            <div key={s} onClick={() => setSide(s)} style={{
              cursor: "pointer", padding: "9px 13px", borderRadius: 12, fontFamily: M.display,
              fontWeight: 700, fontSize: 12.5,
              background: sel ? M.gradient : M.fillAlt, color: sel ? M.deepGreen : "#5f7168",
              boxShadow: sel ? `0 3px 0 ${M.brandShadow}` : "none",
            }}>{s}</div>
          );
        })}
      </div>

      <div style={label}>How bad is it?</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map(n => {
          const sel = severity === n;
          return (
            <div key={n} onClick={() => setSeverity(n)} style={{
              cursor: "pointer", flex: 1, textAlign: "center", padding: "10px 0", borderRadius: 12,
              fontFamily: M.display, fontWeight: 700, fontSize: 15,
              background: sel ? M.gradient : M.fillAlt, color: sel ? M.deepGreen : "#5f7168",
              boxShadow: sel ? `0 3px 0 ${M.brandShadow}` : "none",
            }}>{n}</div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: M.sub, marginBottom: 18, lineHeight: 1.4 }}>{SEVERITY_LABELS[severity]}</div>

      {!editing && (
        <>
          <div style={label}>When did it start?</div>
          <input type="date" value={onsetDate} max={toLocalDateStr(new Date())} onChange={e => setOnsetDate(e.target.value)} style={input} />
        </>
      )}

      {editing && (
        <>
          <div style={label}>Resolved on</div>
          <input type="date" value={resolvedDate} max={toLocalDateStr(new Date())} onChange={e => setResolvedDate(e.target.value)} style={input} />
        </>
      )}

      <div style={label}>Days of training missed (optional)</div>
      <input type="number" inputMode="numeric" value={timeLossDays} onChange={e => setTimeLossDays(e.target.value)} placeholder="e.g. 2" style={input} />

      <div style={label}>Notes (optional)</div>
      <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. felt it during the serve, second set" style={input} />

      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16, padding: 16,
        textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 16, boxShadow: M.cta,
        opacity: saving ? 0.6 : 1,
      }}>{editing ? "Save update 🩹" : "Log it 🩹"}</div>
    </>
  );
}
