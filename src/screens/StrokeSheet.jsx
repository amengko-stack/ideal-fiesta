import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { M } from "../styles/mobileTheme.js";
import { toLocalDateStr } from "../lib/dates.js";
import { STROKE_AREAS, ASSESSMENT_SOURCES, categoryOf } from "../lib/strokes.js";

const label = { fontSize: 11, color: M.sub, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 9 };
const input = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1.5px solid #D6E2DB",
  borderRadius: 12, background: M.card, fontFamily: M.display, fontWeight: 600,
  fontSize: 14, color: M.ink, outline: "none", marginBottom: 18,
};
const PRIORITIES = ["High", "Medium", "Monitor"];
const PRIORITY_COLOR = { High: M.danger, Medium: M.warn, Monitor: M.parentBlue };

export default function StrokeSheet({ athleteId, onSaved, onClose }) {
  const [area, setArea]           = useState(Object.values(STROKE_AREAS).flat()[0]);
  const [assessment, setAssessment] = useState("");
  const [source, setSource]       = useState("Video Analysis");
  const [priority, setPriority]   = useState("Medium");
  const [review, setReview]       = useState(true);
  const [reviewDate, setReviewDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 28);
    return toLocalDateStr(d);
  });
  const [saving, setSaving]       = useState(false);

  const save = () => {
    if (saving) return;
    if (!assessment.trim()) {
      onSaved("Write the assessment first ✍️");
      return;
    }
    setSaving(true);
    // Same entry shape as the classic TechnicalTab. Fire-and-forget.
    addDoc(collection(db, "athletes", athleteId, "technicalAssessments"), {
      strokeArea:    area,
      category:      categoryOf(area),
      date:          toLocalDateStr(new Date()),
      source,
      assessment:    assessment.trim().slice(0, 1500),
      priority,
      reviewDueDate: review ? reviewDate : null,
      status:        "active",
    }).catch(e => console.error("StrokeSheet save:", e));
    onSaved(`${area} assessment saved 🎾`);
    onClose();
  };

  return (
    <>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink, marginBottom: 16 }}>Stroke assessment 🎾</div>

      <div style={label}>Stroke area</div>
      <select value={area} onChange={e => setArea(e.target.value)} style={{ ...input, appearance: "auto" }}>
        {Object.entries(STROKE_AREAS).map(([cat, areas]) => (
          <optgroup key={cat} label={cat}>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </optgroup>
        ))}
      </select>

      <div style={label}>Assessment</div>
      <textarea
        value={assessment} onChange={e => setAssessment(e.target.value)} rows={4}
        placeholder="e.g. Toss drifting left under pressure; contact point late on second serves"
        style={{ ...input, fontFamily: M.body, resize: "vertical", lineHeight: 1.5 }}
      />

      <div style={label}>Source</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {ASSESSMENT_SOURCES.map(s => {
          const sel = source === s;
          return (
            <div key={s} onClick={() => setSource(s)} style={{
              cursor: "pointer", padding: "9px 13px", borderRadius: 12, fontFamily: M.display,
              fontWeight: 700, fontSize: 12.5,
              background: sel ? M.gradient : M.fillAlt, color: sel ? M.deepGreen : "#5f7168",
            }}>{s}</div>
          );
        })}
      </div>

      <div style={label}>Priority</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {PRIORITIES.map(p => {
          const sel = priority === p;
          return (
            <div key={p} onClick={() => setPriority(p)} style={{
              cursor: "pointer", flex: 1, textAlign: "center", padding: "11px 6px", borderRadius: 14,
              fontFamily: M.display, fontWeight: 700, fontSize: 13,
              background: sel ? PRIORITY_COLOR[p] : M.fillAlt, color: sel ? "#fff" : "#5f7168",
            }}>{p}</div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: review ? 12 : 22 }}>
        <div>
          <div style={{ fontSize: 13.5, color: M.ink, fontWeight: 700, fontFamily: M.display }}>🎥 Schedule a review</div>
          <div style={{ fontSize: 11.5, color: M.sub, marginTop: 2 }}>Flag this stroke for a follow-up check</div>
        </div>
        <div onClick={() => setReview(r => !r)} style={{
          cursor: "pointer", width: 52, height: 30, borderRadius: 99, position: "relative",
          background: review ? M.warn : "#D6E2DB", transition: "background .15s", flexShrink: 0,
        }}>
          <div style={{ position: "absolute", top: 3, left: review ? 25 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
        </div>
      </div>
      {review && (
        <>
          <div style={label}>Review date</div>
          <input type="date" value={reviewDate} min={toLocalDateStr(new Date())} onChange={e => setReviewDate(e.target.value)} style={input} />
        </>
      )}

      <div onClick={save} style={{
        cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 16, padding: 16,
        textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 16, boxShadow: M.cta,
        opacity: saving ? 0.6 : 1,
      }}>Save assessment 🎾</div>
    </>
  );
}
