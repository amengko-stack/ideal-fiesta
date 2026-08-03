import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import {
  addDoc, collection, getDocs, query, orderBy, updateDoc, doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { toLocalDateStr } from "../lib/dates.js";
import { COLORS } from "../styles/theme.js";
import { STROKE_AREAS } from "../lib/strokes.js";

// ─── TECHNICAL TAB ────────────────────────────────────────────────────────────
export default function TechnicalTab({ athleteId }) {
  const today6wk = () => {
    const d = new Date(); d.setDate(d.getDate() + 42);
    return toLocalDateStr(d);
  };
  const todayStr = toLocalDateStr(new Date());

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

  // Nothing else ever moves a technicalAssessments doc off status:"active", so
  // a review reminder (reviewDueDate <= today) could never clear once it
  // fired. This is the missing affordance: mark the latest assessment for an
  // area "reviewed" once it's actually been looked at, which both this tab's
  // own reviewDue banner and the reminders engine's technical-review check key
  // off of `status === "active"`.
  const markReviewed = async (entry) => {
    if (!entry?.id) return;
    try {
      await updateDoc(doc(db, "athletes", athleteId, "technicalAssessments", entry.id), { status: "reviewed" });
      setAssessments(prev => prev.map(a => (a.id === entry.id ? { ...a, status: "reviewed" } : a)));
    } catch (e) {
      console.error("Failed to mark assessment reviewed:", e);
    }
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

  // Review-due areas: past their date AND not already reviewed. The status
  // check is what lets "✓ Mark Reviewed" actually clear this — without it the
  // banner keeps nagging forever, since nothing ever moves reviewDueDate.
  const isReviewDue = (entry) => entry?.reviewDueDate
    && entry.reviewDueDate <= todayStr
    && entry.status !== "reviewed";

  const reviewDue = Object.entries(byArea)
    .filter(([, entries]) => isReviewDue(entries[0]))
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
            const isDue   = isReviewDue(latest);
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
                    {isDue && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: "#3b82f6", borderColor: "#3b82f6", fontSize: "0.76rem" }}
                        onClick={() => markReviewed(latest)}
                      >
                        ✓ Mark Reviewed
                      </button>
                    )}
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
