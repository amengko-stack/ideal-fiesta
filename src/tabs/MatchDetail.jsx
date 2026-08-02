import { useState, useEffect } from "react";
import {
  Activity, BarChart2, MessageSquare, Target, TrendingUp, Zap,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { generateMatchAnalysis } from "../lib/matchAnalysis.js";
import { COLORS } from "../styles/theme.js";
import { friendlyAiError } from "../lib/aiErrors.js";

// ── Shared table styles ──
const TH  = { fontSize: "0.7rem", color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", padding: "5px 8px", textAlign: "right" };
const THL = { ...TH, textAlign: "left" };
const THV = { ...TH, color: COLORS.accent };
const TD  = { padding: "9px 8px", fontSize: "0.88rem", textAlign: "right", borderTop: `1px solid ${COLORS.border}`, color: COLORS.text };
const TDL = { ...TD, textAlign: "left", color: COLORS.muted, fontSize: "0.82rem" };

// Side-by-side stat table: rows = [label, valissaVal, oppVal, valissaColor?]
const SideBySide = ({ rows, valissaName, opponentName }) => (
  <table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead>
      <tr>
        <th style={THL}>Stat</th>
        <th style={THV}>{valissaName || "Valissa"}</th>
        <th style={TH}>{opponentName || "Opponent"}</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(([label, vVal, oVal, vColor]) => (
        <tr key={label}>
          <td style={TDL}>{label}</td>
          <td style={{ ...TD, color: vColor || COLORS.text, fontWeight: vColor ? 700 : 400 }}>{vVal}</td>
          <td style={TD}>{oVal}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

// ─── MATCH DETAIL VIEW ────────────────────────────────────────────────────────
export default function MatchDetail({ match, onBack, onDelete, athleteId }) {
  const [confirmDelete,   setConfirmDelete]   = useState(false);
  const [analysis,        setAnalysis]        = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError,   setAnalysisError]   = useState(null);
  const [escalations,     setEscalations]     = useState([]);

  const v    = match.valissa  || {};
  const o    = match.opponent || {};
  const calc = match.calculated || {};
  const rally = calc.rallyDistribution || {};

  // Load existing saved analysis on mount
  useEffect(() => {
    if (!athleteId) return;
    const matchId = match.id || match.matchId;
    if (!matchId) return;
    getDoc(doc(db, "athletes", athleteId, "matchAnalyses", matchId))
      .then(snap => { if (snap.exists()) setAnalysis(snap.data()); })
      .catch(() => {});
  }, [athleteId, match.id, match.matchId]);

  const handleGenerateAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const { analysis: parsed, escalations: escalatedItems } = await generateMatchAnalysis(athleteId, match);
      setAnalysis(parsed);
      setEscalations(escalatedItems);
    } catch (err) {
      console.error("Analysis error:", err);
      // Was a fixed "make sure the backend server is running", which is wrong
      // for most causes and sent people chasing the wrong problem.
      setAnalysisError(friendlyAiError(err));
    } finally {
      setAnalysisLoading(false);
    }
  };

  const won = match.whoWonMatch === 1;

  const fmtDate = ts => ts
    ? new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  const fmt      = val => val != null ? val : "—";
  // firstServePct may be stored as decimal (0.65) or integer percentage (65)
  const fmtPct   = val => val != null ? `${Math.round(typeof val === "number" && val <= 1 ? val * 100 : val)}%` : "—";
  const fmtRatio = val => val != null ? Number(val).toFixed(2) : "—";
  const calcPct  = (won, total) => (total > 0 && won != null) ? `${Math.round(won / total * 100)}%` : "—";

  // Score from top-level setScores arrays (setOnePlayerOne etc.)
  const score = (() => {
    const sc = match.setScores;
    if (sc && sc.p1 && sc.p1.length) {
      return sc.p1.map((s, i) => `${s}–${sc.p2[i] ?? "?"}`).join(", ");
    }
    // Legacy fallback (old documents stored setOneScore on valissa stats)
    const sets = [];
    if (v.setOneScore != null && o.setOneScore != null) sets.push(`${v.setOneScore}–${o.setOneScore}`);
    if (v.setTwoScore != null && o.setTwoScore != null) sets.push(`${v.setTwoScore}–${o.setTwoScore}`);
    return sets.length ? sets.join(", ") : "—";
  })();

  const oppWueRatio = o.unforcedErrors > 0 ? o.winners / o.unforcedErrors : null;

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Match History
      </button>

      {/* ── Section 1: Match Info ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", color: COLORS.text, lineHeight: 1.1 }}>
              vs {match.opponentName || "Unknown Opponent"}
            </div>
            <div style={{ color: COLORS.muted, fontSize: "0.8rem", marginTop: 3 }}>{fmtDate(match.matchStartTime)}</div>
          </div>
          <span className={`badge ${won ? "badge-green" : "badge-red"}`}>{won ? "Win" : "Loss"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[["Score", score], ["Tournament", match.season || "—"]].map(([label, val]) => (
            <div key={label}>
              <div className="label">{label}</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: COLORS.text, marginTop: 3 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Service Stats ── */}
      <div className="card">
        <div className="card-title"><Zap size={16} /> Service Stats</div>
        <SideBySide valissaName={match.valissaName} opponentName={match.opponentName} rows={[
          ["1st Serve %",          fmtPct(v.firstServePct),                               fmtPct(o.firstServePct)],
          ["1st Serve Pts Won",    calcPct(v.firstServePointsWon, v.firstServePoints),     calcPct(o.firstServePointsWon, o.firstServePoints)],
          ["2nd Serve Pts Won",    calcPct(v.secondServePointsWon, v.secondServePoints),   calcPct(o.secondServePointsWon, o.secondServePoints)],
          ["Aces",                 fmt(v.aces),                                            fmt(o.aces)],
          ["Double Faults",        fmt(v.doubleFaults),                                   fmt(o.doubleFaults)],
        ]} />
      </div>

      {/* ── Section 3: Return Stats ── */}
      <div className="card">
        <div className="card-title"><Activity size={16} /> Return Stats</div>
        <SideBySide valissaName={match.valissaName} opponentName={match.opponentName} rows={[
          ["1st Return Pts Won",   calcPct(v.firstReturnPointsWon, v.firstReturnPoints),   calcPct(o.firstReturnPointsWon, o.firstReturnPoints)],
          ["2nd Return Pts Won",   calcPct(v.secondReturnPointsWon, v.secondReturnPoints), calcPct(o.secondReturnPointsWon, o.secondReturnPoints)],
          ["Break Pts Converted",  calcPct(v.breakPointsWon, v.breakPoints),               calcPct(o.breakPointsWon, o.breakPoints)],
        ]} />
      </div>

      {/* ── Section 4: Point Stats ── */}
      <div className="card">
        <div className="card-title"><BarChart2 size={16} /> Point Stats</div>
        <SideBySide valissaName={match.valissaName} opponentName={match.opponentName} rows={[
          ["Winners",        fmt(v.winners),       fmt(o.winners)],
          ["Unforced Errors",fmt(v.unforcedErrors), fmt(o.unforcedErrors), v.unforcedErrors > o.unforcedErrors ? COLORS.red : null],
          ["Forced Errors",  fmt(v.forcedErrors),  fmt(o.forcedErrors)],
          ["W:UE Ratio",     fmtRatio(calc.wueRatio), fmtRatio(oppWueRatio)],
        ]} />
      </div>

      {/* ── Section 5: Rally Length ── */}
      <div className="card">
        <div className="card-title"><TrendingUp size={16} /> Rally Length</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={THL}>Rally</th>
              <th style={TH}>Total Pts</th>
              <th style={THV}>Valissa Win %</th>
            </tr>
          </thead>
          <tbody>
            {[["0–4 shots", "0-4"], ["5–8 shots", "5-8"], ["9+ shots", "9+"]].map(([label, key]) => {
              const b = rally[key] || {};
              const pct = b.valissaWinPct;
              const col = pct == null ? COLORS.muted : pct >= 50 ? COLORS.accent : pct >= 40 ? COLORS.yellow : COLORS.red;
              return (
                <tr key={key}>
                  <td style={TDL}>{label}</td>
                  <td style={TD}>{b.total ?? "—"}</td>
                  <td style={{ ...TD, color: col, fontWeight: 700 }}>{pct != null ? `${pct}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Section 6: Shot Breakdown (Valissa only) ── */}
      <div className="card">
        <div className="card-title"><Target size={16} /> Shot Breakdown — {match.valissaName || "Valissa"}</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={THL}>Shot</th>
              <th style={{ ...TH, color: COLORS.accent }}>Winners</th>
              <th style={{ ...TH, color: COLORS.red }}>Errors</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Forehand",  v.fhWinner,       v.fhError],
              ["Backhand",  v.bhWinner,       v.bhError],
              ["Return",    (v.fhReturnWinner ?? 0) + (v.bhReturnWinner ?? 0),
                            (v.fhReturnError  ?? 0) + (v.bhReturnError  ?? 0)],
              ["Approach",  v.approachWinner, v.approachError],
            ].map(([label, w, e]) => (
              <tr key={label}>
                <td style={TDL}>{label}</td>
                <td style={{ ...TD, color: COLORS.accent, fontWeight: 600 }}>{fmt(w)}</td>
                <td style={{ ...TD, color: COLORS.red }}>{fmt(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── AI Coach Analysis ── */}
      <div className="card" style={{ borderColor: COLORS.accentDim, background: `${COLORS.accent}08` }}>
        <div className="card-title"><MessageSquare size={16} /> AI Coach Analysis</div>

        {analysisError && (
          <div style={{ color: COLORS.red, fontSize: "0.83rem", marginBottom: 12 }}>{analysisError}</div>
        )}

        {escalations.length > 0 && (
          <div style={{ background: `${COLORS.red}18`, border: `1px solid ${COLORS.red}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.85rem", marginBottom: 6 }}>⚠ Escalated Priorities</div>
            {escalations.map((e, i) => (
              <div key={i} style={{ fontSize: "0.82rem", color: COLORS.text, marginBottom: 4 }}>
                <strong>{e.priority}</strong> — deferred {e.weeksDeferredCount} weeks
              </div>
            ))}
          </div>
        )}

        {!analysis && !analysisLoading && (
          <>
            <p style={{ color: COLORS.muted, fontSize: "0.83rem", marginBottom: 14 }}>
              Generate a personalized coaching report for this match based on serve stats, return stats, rally patterns, and shot distribution.
            </p>
            <button className="btn btn-primary" onClick={handleGenerateAnalysis} style={{ gap: 8 }}>
              <Zap size={14} /> Generate Analysis
            </button>
          </>
        )}

        {analysisLoading && (
          <div style={{ textAlign: "center", padding: "24px 0", color: COLORS.muted }}>
            <div style={{ fontSize: "1.4rem", marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: "0.9rem" }}>Analyzing match...</div>
          </div>
        )}

        {analysis && !analysisLoading && (() => {
          const SecHeader = ({ children, color }) => (
            <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: color || COLORS.muted, marginBottom: 6 }}>
              {children}
            </div>
          );
          return (
            <div>
              {/* Match Summary */}
              <div style={{ marginBottom: 18 }}>
                <SecHeader>Match Summary</SecHeader>
                <p style={{ fontSize: "0.88rem", color: COLORS.text, lineHeight: 1.6, margin: 0 }}>{analysis.matchSummary}</p>
              </div>

              {/* Load & Wellbeing Context */}
              {analysis.loadContext && (
                <div style={{ background: `${COLORS.accent}10`, border: `1px solid ${COLORS.accentDim}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                  <SecHeader color={COLORS.accentDim}>Load & Wellbeing Context</SecHeader>
                  <p style={{ fontSize: "0.83rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.loadContext}</p>
                </div>
              )}

              {/* Critical Findings */}
              {analysis.criticalFindings?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Critical Findings</SecHeader>
                  {analysis.criticalFindings.map((cf, i) => {
                    const borderCol = cf.priority === "critical" ? COLORS.red : cf.priority === "important" ? COLORS.yellow : COLORS.border;
                    const bgCol     = cf.priority === "critical" ? `${COLORS.red}12` : cf.priority === "important" ? `${COLORS.yellow}12` : "transparent";
                    return (
                      <div key={i} style={{ border: `1px solid ${borderCol}`, background: bgCol, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                        <span style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: borderCol }}>{cf.priority}</span>
                        <p style={{ fontSize: "0.84rem", color: COLORS.text, margin: "4px 0 0" }}>{cf.finding}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Strengths */}
              {analysis.strengthsToReinforce?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Strengths to Reinforce</SecHeader>
                  {analysis.strengthsToReinforce.map((s, i) => (
                    <div key={i} style={{ fontSize: "0.84rem", color: COLORS.text, padding: "5px 0", borderTop: i === 0 ? "none" : `1px solid ${COLORS.border}` }}>
                      ✓ {s}
                    </div>
                  ))}
                </div>
              )}

              {/* Rally Pattern Analysis */}
              {analysis.rallyPatternAnalysis && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Rally Pattern Analysis</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.rallyPatternAnalysis}</p>
                </div>
              )}

              {/* Serve Analysis */}
              {analysis.serveAnalysis && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Serve Analysis</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.serveAnalysis}</p>
                </div>
              )}

              {/* Shot Breakdown Insights */}
              {analysis.shotBreakdownInsights && (
                <div style={{ marginBottom: 14 }}>
                  <SecHeader>Shot Breakdown Insights</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.shotBreakdownInsights}</p>
                </div>
              )}

              {/* Deferred Priorities */}
              {analysis.deferredPriorities?.length > 0 && (
                <div style={{ background: `${COLORS.yellow}10`, border: `1px solid ${COLORS.yellow}50`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                  <SecHeader color={COLORS.yellow}>Deferred Priorities</SecHeader>
                  {analysis.deferredPriorities.map((dp, i) => (
                    <div key={i} style={{ marginBottom: i < analysis.deferredPriorities.length - 1 ? 10 : 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.84rem", color: COLORS.text }}>{dp.priority}</div>
                      {dp.reason && <div style={{ fontSize: "0.78rem", color: COLORS.muted, marginTop: 2 }}>{dp.reason}</div>}
                      {dp.resolveCondition && <div style={{ fontSize: "0.78rem", color: COLORS.muted, marginTop: 2, fontStyle: "italic" }}>Resolve when: {dp.resolveCondition}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Parent Note */}
              {analysis.parentNote && (
                <div style={{ background: `${COLORS.accent}0d`, border: `1px solid ${COLORS.accentDim}60`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                  <SecHeader color={COLORS.accentDim}>Note for Parent</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.parentNote}</p>
                </div>
              )}

              {/* Athlete Note */}
              {analysis.athleteNote && (
                <div style={{ background: `${COLORS.border}60`, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                  <SecHeader>Note for {match.valissaName || "Valissa"}</SecHeader>
                  <p style={{ fontSize: "0.84rem", color: COLORS.text, lineHeight: 1.5, margin: 0 }}>{analysis.athleteNote}</p>
                </div>
              )}

              <button className="btn btn-ghost btn-sm" onClick={handleGenerateAnalysis} style={{ gap: 6 }}>
                <Zap size={13} /> Regenerate Analysis
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── Delete Match ── */}
      <div className="card" style={{ borderColor: COLORS.red, background: "rgba(255,77,109,0.06)" }}>
        {!confirmDelete ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmDelete(true)}
            style={{ color: COLORS.red, borderColor: COLORS.red }}
          >
            Delete Match
          </button>
        ) : (
          <>
            <div style={{ fontSize: "0.85rem", color: COLORS.text, marginBottom: 12 }}>
              Delete this match and re-import?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn btn-sm"
                style={{ background: COLORS.red, color: "#fff", border: "none" }}
                onClick={() => onDelete(match.id || match.matchId)}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
