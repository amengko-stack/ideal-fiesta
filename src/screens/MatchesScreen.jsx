/* eslint-disable react-refresh/only-export-components */
import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { daysUntil } from "../lib/tournaments.js";
import { toLocalDateStr } from "../lib/dates.js";

const LEVEL_COLOR = { Fun: M.cheer, Club: M.success, Regional: M.parentBlue, National: M.warn };

export const fmtMatchDate = (ts) => ts
  ? new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
  : "—";

export const fmtScore = (m) => {
  const p1 = m.setScores?.p1 || [], p2 = m.setScores?.p2 || [];
  if (!p1.length) return "score unavailable";
  return p1.map((s, i) => `${s}-${p2[i] ?? "?"}`).join(", ");
};

const sortedByRecency = (matches) => [...(matches || [])].sort((a, b) => {
  if (!a.matchStartTime) return 1;
  if (!b.matchStartTime) return -1;
  return b.matchStartTime.localeCompare(a.matchStartTime);
});

export default function MatchesScreen({ matches, tournaments, seasonReport, seasonLoading, showParentNotes, liveDraft, onStartLive, onResumeLive, onDiscardLive, onOpenMatch, onOpenImport, onAddTournament, onGenerateSeason }) {
  const list = sortedByRecency(matches);
  const wins = list.filter(m => m.whoWonMatch === 1).length;
  const total = list.length;
  const winRate = total ? Math.round((wins / total) * 100) : 0;
  const c = 2 * Math.PI * 46;
  const off = c * (1 - winRate / 100);

  const today = toLocalDateStr(new Date());
  const upcoming = (tournaments || [])
    .filter(t => t.date && daysUntil(t.date, today) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      {/* in-progress live match */}
      {liveDraft && (
        <Card style={{ background: M.darkCard, padding: 16 }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.lime, marginBottom: 4 }}>
            Match in progress 🎾
          </div>
          <div style={{ fontSize: 12.5, color: "#aebfb6", marginBottom: 12 }}>
            vs {liveDraft.config?.opponentName || "Opponent"} · {liveDraft.log?.length || 0} points scored
          </div>
          <div onClick={onResumeLive} style={{
            cursor: "pointer", background: M.gradient, color: M.deepGreen, borderRadius: 13,
            padding: 12, textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 14,
          }}>Resume scoring ▶</div>
          <div onClick={onDiscardLive} style={{ cursor: "pointer", textAlign: "center", fontSize: 11.5, fontWeight: 700, fontFamily: M.display, color: "#688577", marginTop: 10 }}>
            discard this match
          </div>
        </Card>
      )}

      {/* win-rate hero */}
      <Card style={{ borderRadius: 24, padding: 20, display: "flex", alignItems: "center", gap: 18, boxShadow: M.dropLg }}>
        <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
          <svg width="110" height="110" viewBox="0 0 110 110">
            <defs>
              <linearGradient id="wrG" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={M.lime} /><stop offset="1" stopColor={M.ringGradTo} />
              </linearGradient>
            </defs>
            <circle cx="55" cy="55" r="46" fill="none" stroke={M.dividerAlt} strokeWidth="12" />
            <circle cx="55" cy="55" r="46" fill="none" stroke="url(#wrG)" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 55 55)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 32, lineHeight: 0.8, color: M.ink }}>{winRate}%</div>
            <div style={{ fontSize: 10, color: M.sub, fontWeight: 700, letterSpacing: ".08em" }}>WINS</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 26, color: M.ink, lineHeight: 1 }}>{wins}W · {total - wins}L</div>
          <div style={{ fontSize: 12.5, color: M.sub, marginTop: 6 }}>this season</div>
          <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
            {list.slice(0, 5).map((m) => {
              const w = m.whoWonMatch === 1;
              return (
                <div key={m.id || m.matchId} style={{
                  width: 24, height: 24, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: M.display, fontWeight: 700, fontSize: 12,
                  color: w ? M.deepGreen : "#fff", background: w ? M.limeDim : "#f0736e",
                }}>{w ? "W" : "L"}</div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* upcoming tournaments */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink }}>Upcoming tournaments 🏟️</span>
          <span onClick={onAddTournament} style={{ cursor: "pointer", fontFamily: M.display, fontWeight: 700, fontSize: 12.5, color: "#5c7a0a" }}>＋ Add</span>
        </div>
        {upcoming.length === 0 && (
          <div onClick={onAddTournament} style={{ cursor: "pointer", textAlign: "center", padding: "16px 0", fontSize: 13, color: M.sub }}>
            No tournaments scheduled yet.<br /><span style={{ fontWeight: 700, color: "#5c7a0a" }}>Tap ＋ Add to log one →</span>
          </div>
        )}
        {upcoming.map(t => {
          const days = daysUntil(t.date, today);
          const near = days <= 7;
          const lc = LEVEL_COLOR[t.level] || M.success;
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${M.divider}` }}>
              <div style={{
                flexShrink: 0, width: 46, height: 46, borderRadius: 13, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                color: near ? M.deepGreen : "#5f7168", background: near ? M.gradient : M.fillAlt,
              }}>
                <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 18, lineHeight: 0.9 }}>{days}</div>
                <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".04em" }}>{days === 1 ? "day" : "days"}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink }}>{t.name}</div>
                <div style={{ fontSize: 11, color: M.sub }}>{t.level} · {t.date}</div>
              </div>
              <span style={{
                flexShrink: 0, fontFamily: M.display, fontWeight: 700, fontSize: 12, padding: "4px 11px",
                borderRadius: 999, color: lc, background: `${lc}1f`,
              }}>{days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `in ${days}d`}</span>
            </div>
          );
        })}
      </Card>

      {/* season intelligence */}
      <Card style={{ background: M.darkCard, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>🧠</span>
          <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.lime }}>Season intelligence</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: M.limeDim, background: "rgba(200,245,100,0.14)", padding: "3px 8px", borderRadius: 20 }}>AI</span>
        </div>
        {seasonLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "18px 0" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #23433a", borderTopColor: M.lime, animation: "spin .7s linear infinite" }} />
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.lime }}>Analysing the season…</div>
          </div>
        ) : seasonReport ? (
          <>
            <div style={{ fontSize: 13, color: "#eaf3ee", lineHeight: 1.55, marginBottom: 14 }}>
              {seasonReport.seasonOverview || seasonReport.overview || seasonReport.developmentalStageAssessment || "Season analysis ready."}
            </div>
            {showParentNotes && seasonReport.parentNote && (
              <div style={{ padding: "12px 13px", background: "rgba(47,127,217,0.14)", borderRadius: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: "#7fb6f0", marginBottom: 4 }}>FOR PARENTS</div>
                <div style={{ fontSize: 12.5, color: "#dfeee6", lineHeight: 1.5 }}>{seasonReport.parentNote}</div>
              </div>
            )}
            <div onClick={onGenerateSeason} style={{ cursor: "pointer", textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 12.5, color: M.limeDim }}>↺ Regenerate</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "#aebfb6", lineHeight: 1.5, marginBottom: 14 }}>
              {total} match{total === 1 ? "" : "es"} recorded. Generate an AI review to spot patterns, strengths and what to work on next.
            </div>
            <div onClick={total ? onGenerateSeason : undefined} style={{
              cursor: total ? "pointer" : "default", background: total ? M.gradient : "#23433a",
              color: total ? M.deepGreen : "#688577", borderRadius: 13, padding: 13, textAlign: "center",
              fontFamily: M.display, fontWeight: 700, fontSize: 14.5,
            }}>✨ Generate season analysis</div>
          </>
        )}
      </Card>

      {/* score live */}
      {!liveDraft && (
        <div onClick={onStartLive} style={{
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          background: M.gradient, borderRadius: 16, padding: 15, marginBottom: 10,
          fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.deepGreen, boxShadow: M.cta,
        }}>🎾 Score a live match</div>
      )}

      {/* import */}
      <div onClick={onOpenImport} style={{
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: M.card, border: "2px dashed #9bc46a", borderRadius: 16, padding: 14, marginBottom: 14,
        fontFamily: M.display, fontWeight: 700, fontSize: 14, color: "#5c7a0a", boxShadow: M.dropSm,
      }}>＋ Import .matchtrack file</div>

      {/* history */}
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink, marginBottom: 9, paddingLeft: 2 }}>Match history</div>
      {list.length === 0 && (
        <Card style={{ textAlign: "center", color: M.sub, fontSize: 13 }}>No matches yet — import a .matchtrack file to get started 🎾</Card>
      )}
      {list.map(m => {
        const w = m.whoWonMatch === 1;
        return (
          <div key={m.id || m.matchId} onClick={() => onOpenMatch(m)} style={{
            cursor: "pointer", display: "flex", alignItems: "center", gap: 13, background: M.card,
            borderRadius: 16, padding: 14, marginBottom: 9, boxShadow: M.dropSm,
          }}>
            <div style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: M.display, fontWeight: 700, fontSize: 16,
              color: w ? M.deepGreen : "#fff", background: w ? M.gradient : "#f0736e",
            }}>{w ? "W" : "L"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14.5, color: M.ink }}>{m.opponentName || "Unknown opponent"}</div>
              <div style={{ fontSize: 12, color: M.sub, marginTop: 1 }}>{fmtScore(m)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 11, color: M.muted, fontWeight: 700 }}>{fmtMatchDate(m.matchStartTime)}</span>
              <div style={{ fontSize: 10.5, color: "#5c7a0a", fontWeight: 700, marginTop: 2 }}>details ›</div>
            </div>
          </div>
        );
      })}
    </>
  );
}
