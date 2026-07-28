import { useState, useMemo } from "react";
import { M } from "../styles/mobileTheme.js";
import { fmtMatchDate, fmtScore } from "./MatchesScreen.jsx";
import { shareCoachReport } from "../lib/coachReport.js";
import { computeMatchStats, statsFromAggregates } from "../lib/matchStats.js";
import MatchStatsView from "./MatchStatsView.jsx";

const PRIORITY_COLOR = { critical: M.danger, important: M.warn, monitor: M.parentBlue };

export default function MatchDetailSheet({ match, analysis, analysisLoading, generating, onGenerate, onDelete }) {
  // Full stats come from the point log when there is one; legacy imports that
  // only carry aggregates fall back to a reduced table.
  const log = useMemo(() => (Array.isArray(match?.matchLog) ? match.matchLog : []), [match]);
  const stats = useMemo(() => (
    log.length
      ? computeMatchStats(log, { aces: { p1: match?.valissa?.aces, p2: match?.opponent?.aces } })
      : statsFromAggregates(match)
  ), [log, match]);

  if (!match) return null;
  const won = match.whoWonMatch === 1;
  const v = match.valissa || {};
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: M.ink }}>{match.opponentName || "Unknown opponent"}</div>
        <span style={{
          fontFamily: M.display, fontWeight: 700, fontSize: 13, padding: "4px 12px", borderRadius: 999,
          color: won ? M.deepGreen : "#fff", background: won ? M.gradient : "#f0736e",
        }}>{won ? "Win" : "Loss"}</span>
      </div>
      <div style={{ fontSize: 12.5, color: M.sub, marginBottom: 16 }}>{fmtScore(match)} · {fmtMatchDate(match.matchStartTime)}</div>

      <div style={{ display: "flex", gap: 9, marginBottom: 16 }}>
        {[
          { label: "1st serve", val: v.firstServePct != null ? `${Number(v.firstServePct).toFixed(0)}%` : "—" },
          { label: "winners", val: v.winners ?? "—" },
          { label: "unforced", val: v.unforcedErrors ?? "—" },
          { label: "dbl faults", val: v.doubleFaults ?? "—" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: M.fill, borderRadius: 13, padding: 11, textAlign: "center" }}>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 17, color: M.ink }}>{s.val}</div>
            <div style={{ fontSize: 9.5, color: M.sub, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <PlacementBreakdown match={match} />

      <div style={{ marginBottom: 18 }}>
        <MatchStatsView
          stats={stats}
          log={log}
          names={{ p1: match.valissaName || "Valissa", p2: match.opponentName || "Opponent" }}
        />
      </div>

      {analysisLoading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "14px 0" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: `3px solid ${M.dividerAlt}`, borderTopColor: M.strength, animation: "spin .7s linear infinite" }} />
        </div>
      )}

      {!analysisLoading && analysis && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.limeDim, background: M.darkCard, padding: "3px 9px", borderRadius: 20 }}>AI COACHING REPORT</span>
          </div>
          {analysis.matchSummary && (
            <div style={{ fontSize: 13, color: "#4a5a52", lineHeight: 1.55, marginBottom: 14 }}>{analysis.matchSummary}</div>
          )}
          {analysis.strengthsToReinforce?.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: M.success, textTransform: "uppercase", marginBottom: 8 }}>Strengths to reinforce ✅</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
                {analysis.strengthsToReinforce.map((s, i) => (
                  <span key={i} style={{ fontSize: 11.5, fontWeight: 700, fontFamily: M.display, color: M.deepGreen, background: M.gradient, padding: "5px 11px", borderRadius: 20 }}>{s}</span>
                ))}
              </div>
            </>
          )}
          {analysis.criticalFindings?.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: M.warn, textTransform: "uppercase", margin: "2px 0 8px" }}>Findings 🔍</div>
              {analysis.criticalFindings.map((f, i) => (
                <div key={i} style={{ background: M.card, borderRadius: 12, padding: "11px 13px", marginBottom: 8, boxShadow: M.dropSm }}>
                  <div style={{ fontSize: 12, color: "#4a5a52", lineHeight: 1.5 }}>{f.finding}</div>
                  {f.priority && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: PRIORITY_COLOR[f.priority] || M.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>{f.priority}</span>
                  )}
                </div>
              ))}
            </>
          )}
          {analysis.resolvedPriorities?.length > 0 && (
            <div style={{ marginTop: 4, marginBottom: 14, padding: 13, background: "rgba(18,181,133,0.1)", borderRadius: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.success, marginBottom: 8 }}>✅ CLEARED FROM THE FOCUS LIST</div>
              {analysis.resolvedPriorities.map((p, i) => (
                <div key={i} style={{ marginBottom: i < analysis.resolvedPriorities.length - 1 ? 8 : 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, fontFamily: M.display, color: M.ink }}>{typeof p === "string" ? p : p.priority}</div>
                  {p.evidence && <div style={{ fontSize: 11.5, color: "#4a5a52", lineHeight: 1.45 }}>{p.evidence}</div>}
                </div>
              ))}
            </div>
          )}
          {analysis.athleteNote && (
            <div style={{ marginTop: 14, padding: 13, background: "linear-gradient(150deg,#eefbdf,#e2fbf2)", borderRadius: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: "#5c7a0a", marginBottom: 4 }}>FOR VALISSA 🎾</div>
              <div style={{ fontSize: 13, color: M.ink, fontStyle: "italic", lineHeight: 1.5 }}>"{analysis.athleteNote}"</div>
            </div>
          )}
          {analysis.parentNote && (
            <div style={{ marginTop: 10, padding: 13, background: "rgba(47,127,217,0.1)", borderRadius: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.parentBlue, marginBottom: 4 }}>FOR PARENTS</div>
              <div style={{ fontSize: 12.5, color: "#4a5a52", lineHeight: 1.5 }}>{analysis.parentNote}</div>
            </div>
          )}
        </>
      )}

      {!analysisLoading && !analysis && (
        generating ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "18px 0" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${M.dividerAlt}`, borderTopColor: M.strength, animation: "spin .7s linear infinite" }} />
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink }}>Analysing the match…</div>
          </div>
        ) : (
          <div onClick={onGenerate} style={{
            cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 13,
            padding: 13, textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 14.5,
            boxShadow: M.cta, marginTop: 4,
          }}>✨ Generate coaching report</div>
        )
      )}

      <ShareRow match={match} analysis={analysis} />
      <DeleteRow onDelete={onDelete} />
    </>
  );
}

// Text summary for the coach — native share sheet or clipboard fallback.
function ShareRow({ match, analysis }) {
  const [status, setStatus] = useState(null); // null | "copied" | "failed"
  const share = async () => {
    const result = await shareCoachReport(match, analysis);
    if (result === "shared") return;
    setStatus(result);
    setTimeout(() => setStatus(null), 2500);
  };
  return (
    <div onClick={share} style={{
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      background: M.card, border: "1.5px solid #D6E2DB", borderRadius: 13, padding: 12, marginTop: 14,
      fontFamily: M.display, fontWeight: 700, fontSize: 13.5, color: M.ink, boxShadow: M.dropSm,
    }}>
      {status === "copied" ? "Copied — paste it to the coach ✅"
        : status === "failed" ? "Couldn't share 🙈"
        : "📤 Share coach report"}
    </div>
  );
}

function PlacementBars({ title, parts, total, color }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".04em", color: M.sub, textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
      {parts.map(([lbl, n]) => (
        <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ width: 58, fontSize: 10.5, color: M.muted }}>{lbl}</span>
          <div style={{ flex: 1, height: 7, borderRadius: 4, background: M.dividerAlt, overflow: "hidden" }}>
            <div style={{ width: total ? `${Math.round((n / total) * 100)}%` : 0, height: "100%", background: color }} />
          </div>
          <span style={{ width: 16, textAlign: "right", fontSize: 10.5, fontWeight: 700, color: M.ink }}>{n}</span>
        </div>
      ))}
    </div>
  );
}

// Shot placement — winner direction split + error miss split. Shown only when
// the match carries shotLocation data (live Detailed mode or a tagged import).
function PlacementBreakdown({ match }) {
  const pl = match.calculated?.placement?.p1;
  if (!pl) return null;
  const wd = pl.winnersByDirection, em = pl.errorsByMiss;
  const wdT = wd.crosscourt + wd.downLine + wd.middle;
  const emT = em.net + em.wide + em.long;
  if (wdT + emT === 0) return null;

  return (
    <div style={{ display: "flex", gap: 14, background: M.fill, borderRadius: 13, padding: "12px 13px", marginBottom: 16 }}>
      {wdT > 0 && <PlacementBars title="Winners land" total={wdT} color={M.success}
        parts={[["Crosscourt", wd.crosscourt], ["Down-line", wd.downLine], ["Middle", wd.middle]]} />}
      {emT > 0 && <PlacementBars title="Errors miss" total={emT} color="#f0736e"
        parts={[["Net", em.net], ["Wide", em.wide], ["Long", em.long]]} />}
    </div>
  );
}

// Two-tap delete: first tap arms, second confirms.
function DeleteRow({ onDelete }) {
  const [armed, setArmed] = useState(false);
  if (!onDelete) return null;
  return (
    <div
      onClick={() => (armed ? onDelete() : setArmed(true))}
      style={{
        cursor: "pointer", textAlign: "center", marginTop: 18, padding: 10,
        fontFamily: M.display, fontWeight: 700, fontSize: 12.5,
        color: armed ? "#fff" : M.danger, background: armed ? M.danger : "transparent",
        borderRadius: 12, transition: "all .15s",
      }}
    >{armed ? "Tap again to delete this match permanently" : "Delete match"}</div>
  );
}
