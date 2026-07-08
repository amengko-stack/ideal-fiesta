import { ChevronLeft } from "lucide-react";
import { COLORS } from "../styles/theme.js";

// ─── SEASON REPORT VIEW ──────────────────────────────────────────────────────
export default function SeasonReportView({ report, onBack, onRegenerate, seasonLoading }) {
  const urgencyColor = u => u === "high" ? COLORS.red : u === "medium" ? COLORS.yellow : COLORS.muted;
  const fmtDate = iso => iso
    ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const sorted = [...(report.consistentWeaknesses ?? [])].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3);
  });

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        <ChevronLeft size={15} /> Match History
      </button>

      {/* Header */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="flex-between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: COLORS.text }}>Season Analysis</div>
            <div style={{ color: COLORS.muted, fontSize: "0.78rem", marginTop: 4 }}>
              {report.totalMatchesAnalyzed ?? report.matchCount} matches · Generated {fmtDate(report.generatedAt)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="label" style={{ marginBottom: 2 }}>Overall Record</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.7rem", color: COLORS.accent, lineHeight: 1 }}>
              {report.overallRecord}
            </div>
          </div>
        </div>
      </div>

      {/* Next Month Priority */}
      <div className="card" style={{ border: `1.5px solid ${COLORS.accent}`, marginBottom: 14 }}>
        <div className="label" style={{ color: COLORS.accent, marginBottom: 8 }}>🎯 Next Month Priority</div>
        <div style={{ fontSize: "1rem", fontWeight: 600, color: COLORS.text, lineHeight: 1.55 }}>
          {report.nextMonthPriority}
        </div>
      </div>

      {/* Consistent Weaknesses */}
      {sorted.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Consistent Weaknesses</div>
          {sorted.map((w, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${urgencyColor(w.urgency)}` }}>
              <div className="flex-between" style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: "0.93rem" }}>{w.metric}</div>
                <span style={{
                  fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
                  color: urgencyColor(w.urgency),
                  background: `${urgencyColor(w.urgency)}22`,
                  padding: "2px 8px", borderRadius: 4,
                }}>
                  {w.urgency}
                </span>
              </div>
              <div style={{ color: COLORS.text, fontSize: "0.84rem", marginBottom: 8 }}>{w.pattern}</div>
              <div style={{ color: COLORS.accent, fontSize: "0.82rem" }}>💡 {w.trainingFocus}</div>
            </div>
          ))}
        </div>
      )}

      {/* Improvements */}
      {(report.improvements ?? []).length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Improvements</div>
          {(report.improvements ?? []).map((imp, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${COLORS.accent}` }}>
              <div style={{ fontWeight: 700, fontSize: "0.93rem", color: COLORS.accent, marginBottom: 4 }}>↑ {imp.metric}</div>
              <div style={{ color: COLORS.text, fontSize: "0.84rem" }}>{imp.trend}</div>
            </div>
          ))}
        </div>
      )}

      {/* Inconsistencies */}
      {(report.inconsistencies ?? []).length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Inconsistencies</div>
          {(report.inconsistencies ?? []).map((inc, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${COLORS.yellow}` }}>
              <div style={{ fontWeight: 700, fontSize: "0.93rem", color: COLORS.yellow, marginBottom: 4 }}>{inc.metric}</div>
              <div style={{ color: COLORS.text, fontSize: "0.84rem" }}>{inc.observation}</div>
            </div>
          ))}
        </div>
      )}

      {/* Developmental Stage */}
      {report.developmentalStageAssessment && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Developmental Stage</div>
          <div style={{ color: COLORS.text, fontSize: "0.87rem", lineHeight: 1.65 }}>{report.developmentalStageAssessment}</div>
        </div>
      )}

      {/* Long Term Outlook */}
      {report.longTermOutlook && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Long Term Outlook</div>
          <div style={{ color: COLORS.text, fontSize: "0.87rem", lineHeight: 1.65 }}>{report.longTermOutlook}</div>
        </div>
      )}

      {/* Parent Note */}
      {report.parentNote && (
        <div className="card" style={{ marginBottom: 14, background: "rgba(0,229,160,0.06)", borderColor: COLORS.accentDim }}>
          <div className="card-title" style={{ color: COLORS.accent, marginBottom: 8 }}>A Note for You</div>
          <div style={{ color: COLORS.text, fontSize: "0.87rem", lineHeight: 1.65, fontStyle: "italic" }}>{report.parentNote}</div>
        </div>
      )}

      <button
        className="btn btn-ghost"
        onClick={onRegenerate}
        disabled={seasonLoading}
        style={{ width: "100%", marginTop: 4 }}
      >
        {seasonLoading ? "Analyzing season…" : "↺ Regenerate Season Analysis"}
      </button>
    </div>
  );
}
