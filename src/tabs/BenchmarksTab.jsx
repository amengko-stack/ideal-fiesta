import { useState, useEffect } from "react";
import { Activity, TrendingUp } from "lucide-react";
import {
  addDoc, collection, getDocs, query, orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { toLocalDateStr } from "../lib/dates.js";
import { COLORS } from "../styles/theme.js";
import { FITNESS_TESTS } from "../lib/fitnessTests.js";
import { maturityOffset, MATURITY_UNCERTAINTY_NOTE } from "../lib/maturity.js";

// ─── BENCHMARKS TAB ───────────────────────────────────────────────────────────
export default function BenchmarksTab({ athleteId, profile }) {
  // ── Fitness tests state ────────────────────────────────────────────────────
  const [ftEntries,    setFtEntries]    = useState([]);
  const [ftLoading,    setFtLoading]    = useState(true);
  const [ftTestName,   setFtTestName]   = useState(FITNESS_TESTS[0].name);
  const [ftResult,     setFtResult]     = useState("");
  const [ftDate,       setFtDate]       = useState(toLocalDateStr(new Date()));
  const [ftNotes,      setFtNotes]      = useState("");
  // "Retest every 6-8 weeks" cutoff. Lazily initialised so the clock is read
  // once at mount rather than on every render.
  const [cutoff56] = useState(() => toLocalDateStr(new Date(Date.now() - 56 * 24 * 60 * 60 * 1000)));
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

  const maturity = maturityOffset({
    dob, heightCm: height, sittingHeightCm: sittingHeight, weightKg: weight,
  });
  const mirwald   = maturity?.offset ?? null;
  const ageYears  = maturity?.age    ?? null;
  const phvStage  = maturity?.stage  ?? null;

  // One neutral colour for the whole panel. Stage-coded colour is a verdict:
  // green/amber/red on a population estimate tells a parent this number grades
  // their child, which is exactly what it does not do.
  const estimateColor = COLORS.muted;

  const missing = [];
  if (!height)        missing.push("standing height");
  if (!sittingHeight) missing.push("sitting height");
  if (!weight)        missing.push("weight");
  if (!dob)           missing.push("date of birth");

  return (
    <div>
      <div className="card">
        <div className="card-title"><TrendingUp size={18} /> Estimated maturity timing</div>
        <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 10, lineHeight: 1.6 }}>
          The Mirwald equation estimates how many years she is from Peak Height Velocity (PHV) — her fastest period of growth — from standing height, sitting height,
          weight and age. It is a <strong style={{ color: COLORS.text }}>rough anthropometric estimate from a population regression</strong>, not a measurement:
          individual error is wide, and two children with the same numbers can be at genuinely different stages.
        </p>
        <div className="note-box" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: "0.78rem", color: COLORS.text, lineHeight: 1.6 }}>
            <strong>This figure is informational only.</strong> It does not determine S&amp;C, training load, injury risk, readiness,
            match analysis, season analysis, Guardian alerts or Growth Watch, and it never approves or prohibits an exercise. No AI prompt
            in this app is given it — including the one that writes the wording of a Guardian alert. The one place it is carried at all is
            alongside a Guardian assessment, as labelled context with zero weight, excluded from that alert's signal count, severity,
            recommended action and note. Her{" "}
            <strong>measured height history</strong> — the dated measurements in the Growth tab, and the growth velocity derived from them — is the
            growth signal that actually informs current training.
          </div>
        </div>

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
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Estimated offset</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.4rem", color: COLORS.text, lineHeight: 1 }}>
                  {mirwald >= 0 ? "+" : ""}{mirwald}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>estimated years from PHV</div>
              </div>

              <div style={{
                flex: 1, minWidth: 120, background: COLORS.surface, borderRadius: 10,
                padding: "14px 16px", textAlign: "center",
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Estimated band</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.8rem", color: estimateColor, lineHeight: 1.1 }}>
                  {phvStage}
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: 4 }}>
                  estimated / informational
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
              borderLeft: `3px solid ${COLORS.border}`,
              paddingLeft: 12, marginBottom: 16,
            }}>
              <div style={{ fontSize: "0.75rem", color: COLORS.muted, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                What the estimate says — estimated / informational
              </div>
              <div style={{ fontSize: "0.83rem", color: COLORS.text, lineHeight: 1.6 }}>
                {MATURITY_UNCERTAINTY_NOTE}
              </div>
              <div style={{ fontSize: "0.78rem", color: COLORS.muted, lineHeight: 1.6, marginTop: 6 }}>
                No training recommendation follows from this band. What she trains this week comes from the deterministic S&amp;C framework,
                her measured growth velocity and her own logged training history.
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
              💡 Re-measure monthly and update Profile. Repeated <strong>measured</strong> heights are what make the growth picture useful —
              the estimate above only moves because these inputs moved.
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
