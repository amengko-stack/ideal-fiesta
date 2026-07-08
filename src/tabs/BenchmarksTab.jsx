import { useState, useEffect } from "react";
import { Activity, TrendingUp } from "lucide-react";
import {
  addDoc, collection, getDocs, query, orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { COLORS } from "../styles/theme.js";

const FITNESS_TESTS = [
  { name: "5m Sprint",                    unit: "s",    lowerIsBetter: true  },
  { name: "10m Sprint",                   unit: "s",    lowerIsBetter: true  },
  { name: "Spider Run",                   unit: "s",    lowerIsBetter: true  },
  { name: "Standing Broad Jump",          unit: "cm",   lowerIsBetter: false },
  { name: "Single-Leg Broad Jump (Left)", unit: "cm",   lowerIsBetter: false },
  { name: "Single-Leg Broad Jump (Right)",unit: "cm",   lowerIsBetter: false },
  { name: "Overhead Med Ball Throw",      unit: "cm",   lowerIsBetter: false },
  { name: "Push-Up Max",                  unit: "reps", lowerIsBetter: false },
  { name: "Dead Hang",                    unit: "s",    lowerIsBetter: false },
  { name: "Single-Leg Squat (Left)",      unit: "reps", lowerIsBetter: false },
  { name: "Single-Leg Squat (Right)",     unit: "reps", lowerIsBetter: false },
  { name: "Plank Hold",                   unit: "s",    lowerIsBetter: false },
];

// ─── BENCHMARKS TAB ───────────────────────────────────────────────────────────
export default function BenchmarksTab({ athleteId, profile }) {
  // ── Fitness tests state ────────────────────────────────────────────────────
  const [ftEntries,    setFtEntries]    = useState([]);
  const [ftLoading,    setFtLoading]    = useState(true);
  const [ftTestName,   setFtTestName]   = useState(FITNESS_TESTS[0].name);
  const [ftResult,     setFtResult]     = useState("");
  const [ftDate,       setFtDate]       = useState(new Date().toISOString().split("T")[0]);
  const [ftNotes,      setFtNotes]      = useState("");
  const [ftSaving,     setFtSaving]     = useState(false);
  const [expandedTest, setExpandedTest] = useState(null);

  useEffect(() => {
    if (!athleteId) return;
    getDocs(query(
      collection(db, "athletes", athleteId, "benchmarks"),
      orderBy("date", "desc")
    ))
      .then(snap => setFtEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setFtLoading(false));
  }, [athleteId]);

  const handleFtSave = async () => {
    const val = parseFloat(ftResult);
    if (!val || val <= 0 || !ftTestName || !ftDate) return;
    setFtSaving(true);
    const testDef = FITNESS_TESTS.find(t => t.name === ftTestName);
    const entry = { testName: ftTestName, result: val, unit: testDef?.unit ?? "", date: ftDate, notes: ftNotes.trim() };
    try {
      const ref = await addDoc(collection(db, "athletes", athleteId, "benchmarks"), entry);
      setFtEntries(prev => [{ id: ref.id, ...entry }, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setFtResult(""); setFtNotes("");
    } catch (e) {
      console.error("Failed to save benchmark:", e);
    }
    setFtSaving(false);
  };

  // ── Maturity offset data ───────────────────────────────────────────────────
  const height        = parseFloat(profile?.height)        || null;
  const sittingHeight = parseFloat(profile?.sittingHeight) || null;
  const weight        = parseFloat(profile?.weight)        || null;
  const dob           = profile?.dob ? new Date(profile.dob) : null;
  const ageYears      = dob ? (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000) : null;

  let mirwald = null;
  if (height && sittingHeight && weight && ageYears) {
    const legLength = height - sittingHeight;
    const a = ageYears;
    const mo =
      -9.376
      + (0.0001882 * legLength * sittingHeight)
      + (0.0022    * a         * legLength)
      + (0.005841  * a         * sittingHeight)
      - (0.002658  * a         * weight)
      + (0.07693   * (weight / height) * 100);
    mirwald = Math.round(mo * 100) / 100;
  }

  const phvStage = mirwald === null ? null
    : mirwald < -1  ? "Pre-PHV"
    : mirwald <= 1  ? "Mid-PHV"
    : "Post-PHV";

  const phvColor = phvStage === "Pre-PHV"  ? COLORS.accent
    : phvStage === "Mid-PHV"  ? COLORS.yellow
    : COLORS.cheer;

  const implications = {
    "Pre-PHV":  "Foundation phase — emphasise fundamental movement skills, coordination, and technical quality. Growth plates are open; avoid heavy axial loading. Light resistance and bodyweight work are appropriate.",
    "Mid-PHV":  "Rapid growth phase — most sensitive period for injury. Reduce high-impact and plyometric volume. Monitor flexibility closely as bone growth outpaces muscle length. Prioritise injury prevention and movement quality over performance.",
    "Post-PHV": "Post-growth phase — progressive loading becomes more appropriate. Strength training gains accelerate. Can begin building structured resistance load while maintaining technical standards.",
  };

  const missing = [];
  if (!height)        missing.push("standing height");
  if (!sittingHeight) missing.push("sitting height");
  if (!weight)        missing.push("weight");
  if (!dob)           missing.push("date of birth");

  return (
    <div>
      <div className="card">
        <div className="card-title"><TrendingUp size={18} /> Maturity Assessment</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 16 }}>
          Mirwald maturity offset estimates years to/from Peak Height Velocity (PHV) — the point of fastest growth. Used to calibrate training load and injury risk.
        </p>

        {missing.length > 0 ? (
          <div className="note-box" style={{ borderColor: COLORS.yellow, background: "rgba(245,197,24,0.07)" }}>
            <span style={{ color: COLORS.yellow, fontWeight: 600 }}>Missing data: </span>
            <span style={{ color: COLORS.text }}>
              {missing.join(", ")} — enter in the Profile tab to enable this calculation.
            </span>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{
                flex: 1, minWidth: 120, background: COLORS.surface, borderRadius: 10,
                padding: "14px 16px", textAlign: "center",
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Maturity Offset</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.4rem", color: mirwald >= 0 ? COLORS.accent : COLORS.yellow, lineHeight: 1 }}>
                  {mirwald >= 0 ? "+" : ""}{mirwald}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>years from PHV</div>
              </div>

              <div style={{
                flex: 1, minWidth: 120, background: COLORS.surface, borderRadius: 10,
                padding: "14px 16px", textAlign: "center",
                border: `2px solid ${phvColor}`,
              }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>PHV Stage</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: phvColor, lineHeight: 1.1 }}>
                  {phvStage}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>
                  {phvStage === "Pre-PHV"  && "approaching peak growth"}
                  {phvStage === "Mid-PHV"  && "in peak growth window"}
                  {phvStage === "Post-PHV" && "past peak growth"}
                </div>
              </div>

              <div style={{
                flex: 1, minWidth: 120, background: COLORS.surface, borderRadius: 10,
                padding: "14px 16px", textAlign: "center",
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Age</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.4rem", color: COLORS.text, lineHeight: 1 }}>
                  {Math.floor(ageYears)}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>years old</div>
              </div>
            </div>

            <div style={{
              borderLeft: `3px solid ${phvColor}`,
              paddingLeft: 12, marginBottom: 16,
            }}>
              <div style={{ fontSize: "0.75rem", color: phvColor, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Training Implication — {phvStage}
              </div>
              <div style={{ fontSize: "0.83rem", color: COLORS.text, lineHeight: 1.6 }}>
                {implications[phvStage]}
              </div>
            </div>

            <div style={{ background: COLORS.surface, borderRadius: 8, padding: "10px 14px", fontSize: "0.78rem", color: COLORS.muted }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Standing height</span><span style={{ color: COLORS.text }}>{height} cm</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Sitting height</span><span style={{ color: COLORS.text }}>{sittingHeight} cm</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Leg length (standing − sitting)</span><span style={{ color: COLORS.text }}>{Math.round((height - sittingHeight) * 10) / 10} cm</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Weight</span><span style={{ color: COLORS.text }}>{weight} kg</span>
              </div>
            </div>

            <div className="note-box mt16">
              💡 Re-measure monthly and update Profile to track maturity progression over time.
            </div>
          </>
        )}
      </div>

      {/* ── Fitness Tests ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title"><Activity size={18} /> Fitness Tests</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 16 }}>
          Log standardised fitness tests to track physical development over time. Aim to retest every 6–8 weeks.
        </p>

        {/* Log form */}
        <div style={{ background: COLORS.surface, borderRadius: 10, padding: "14px", marginBottom: 20 }}>
          <div style={{ fontSize: "0.75rem", color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Log New Result</div>
          <div className="grid2" style={{ marginBottom: 10 }}>
            <div>
              <div className="label">Test</div>
              <select value={ftTestName} onChange={e => setFtTestName(e.target.value)}>
                {FITNESS_TESTS.map(t => <option key={t.name} value={t.name}>{t.name} ({t.unit})</option>)}
              </select>
            </div>
            <div>
              <div className="label">Result ({FITNESS_TESTS.find(t => t.name === ftTestName)?.unit})</div>
              <input
                type="number" placeholder="e.g. 1.85" step="0.01" min="0"
                value={ftResult} onChange={e => setFtResult(e.target.value)}
              />
            </div>
          </div>
          <div className="grid2" style={{ marginBottom: 10 }}>
            <div>
              <div className="label">Date</div>
              <input type="date" value={ftDate} onChange={e => setFtDate(e.target.value)} />
            </div>
            <div>
              <div className="label">Notes (optional)</div>
              <input placeholder="e.g. slightly fatigued" value={ftNotes} onChange={e => setFtNotes(e.target.value)} />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleFtSave}
            disabled={ftSaving || !parseFloat(ftResult) || !ftDate}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {ftSaving ? "Saving…" : "Save Result"}
          </button>
        </div>

        {ftLoading ? (
          <div style={{ textAlign: "center", padding: 20 }}><div className="spinner" /></div>
        ) : (() => {
          const cutoff56 = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

          // Group entries by test name, sorted newest-first per test
          const byTest = {};
          ftEntries.forEach(e => {
            if (!byTest[e.testName]) byTest[e.testName] = [];
            byTest[e.testName].push(e);
          });

          // Overdue / never tested reminders
          const reminders = FITNESS_TESTS.filter(t => {
            const entries = byTest[t.name];
            if (!entries?.length) return true;
            return entries[0].date < cutoff56;
          });

          const fmtDate = d => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

          return (
            <>
              {reminders.length > 0 && (
                <div style={{ background: "rgba(245,197,24,0.07)", border: `1px solid ${COLORS.yellow}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                  <div style={{ fontSize: "0.75rem", color: COLORS.yellow, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Overdue / Not Yet Recorded
                  </div>
                  {reminders.map(t => {
                    const last = byTest[t.name]?.[0];
                    return (
                      <div key={t.name} style={{ fontSize: "0.8rem", color: COLORS.text, marginBottom: 4 }}>
                        {last
                          ? <><span style={{ color: COLORS.yellow }}>Overdue:</span> {t.name} — last tested {fmtDate(last.date)}</>
                          : <><span style={{ color: COLORS.muted }}>Not yet recorded:</span> {t.name}</>
                        }
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Per-test result cards */}
              {FITNESS_TESTS.map(testDef => {
                const entries = byTest[testDef.name] || [];
                if (!entries.length) return null;
                const latest = entries[0];
                const prev   = entries[1] || null;
                const delta  = prev ? Math.round((latest.result - prev.result) * 100) / 100 : null;
                const improved = delta === null ? null
                  : testDef.lowerIsBetter ? delta < 0 : delta > 0;
                const isExpanded = expandedTest === testDef.name;

                return (
                  <div key={testDef.name} style={{
                    background: COLORS.surface, borderRadius: 10,
                    border: `1px solid ${COLORS.border}`, marginBottom: 10, overflow: "hidden",
                  }}>
                    <div
                      style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                      onClick={() => setExpandedTest(isExpanded ? null : testDef.name)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>{testDef.name}</div>
                        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem", color: COLORS.accent, lineHeight: 1 }}>
                            {latest.result}<span style={{ fontSize: "0.7rem", fontFamily: "'DM Sans', sans-serif", color: COLORS.muted, marginLeft: 2 }}>{testDef.unit}</span>
                          </span>
                          {prev && (
                            <span style={{ fontSize: "0.78rem", color: COLORS.muted }}>
                              prev: {prev.result} {testDef.unit}
                            </span>
                          )}
                          {delta !== null && (
                            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: improved ? COLORS.accent : COLORS.red }}>
                              {improved ? "↑" : "↓"} {Math.abs(delta)} {testDef.unit}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ color: COLORS.muted, fontSize: "0.75rem", marginLeft: 8 }}>{isExpanded ? "▲" : "▼"}</span>
                    </div>

                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "10px 14px" }}>
                        <div style={{ fontSize: "0.72rem", color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>History</div>
                        {entries.map((e, i) => (
                          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: i < entries.length - 1 ? 6 : 0, marginBottom: i < entries.length - 1 ? 6 : 0, borderBottom: i < entries.length - 1 ? `1px solid ${COLORS.border}` : "none", fontSize: "0.8rem" }}>
                            <span style={{ color: COLORS.muted }}>{fmtDate(e.date)}</span>
                            <span style={{ fontWeight: 600, color: COLORS.text }}>{e.result} {testDef.unit}</span>
                            {e.notes && <span style={{ color: COLORS.muted, fontStyle: "italic", fontSize: "0.74rem", maxWidth: 120, textAlign: "right" }}>{e.notes}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {ftEntries.length === 0 && (
                <div className="empty">No fitness tests logged yet. Use the form above to record the first result.</div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
