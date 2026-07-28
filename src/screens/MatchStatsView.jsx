import { useState } from "react";
import { M } from "../styles/mobileTheme.js";
import {
  MATCH_STAT_ROWS, SHOT_GROUPS, formatStat, shotGroupTotal,
} from "../lib/matchStats.js";

// Full head-to-head stats, mirroring MatchTrack's three screens. Context-free:
// used live (from the engine's point log) and after the match (from the saved
// doc's matchLog), so it takes computed stats + the log rather than a match.

const TABS = [
  { id: "match", label: "Match Stats", emoji: "🎾" },
  { id: "shot",  label: "Shot Stats",  emoji: "🎯" },
  { id: "log",   label: "Match Log",   emoji: "📋" },
];

const OUTCOME_SECTIONS = [
  { key: "winners",  label: "Winners",         color: M.success },
  { key: "forced",   label: "Forced Errors",   color: M.warn },
  { key: "unforced", label: "Unforced Errors", color: "#f0736e" },
];

const OUTCOME_LABEL = { w: "winner", ufE: "unforced", fE: "forced", df: "double fault", svcW: "service winner" };
const SHOT_LABEL = Object.fromEntries(
  SHOT_GROUPS.flatMap(g => g.codes.map(c => [c, g.label]))
);

const headerCell = { fontFamily: M.display, fontWeight: 700, fontSize: 12, color: M.sub, textAlign: "center" };

function Names({ names }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0 4px 8px", gap: 8 }}>
      <div style={{ ...headerCell, flex: 1, textAlign: "left", color: M.ink }}>{names.p1}</div>
      <div style={{ ...headerCell, flex: 1, textAlign: "right", color: M.ink }}>{names.p2}</div>
    </div>
  );
}

// value | label | value, the shape MatchTrack uses.
function StatRow({ label, left, right, emphasis }) {
  const val = (v, align) => ({
    flex: "0 0 27%", textAlign: align, fontFamily: M.display, fontWeight: 700,
    fontSize: 13.5, color: emphasis ? M.ink : "#3c4c45",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 4px", borderTop: `1px solid ${M.divider}` }}>
      <div style={val(left, "left")}>{left}</div>
      <div style={{ flex: 1, textAlign: "center", fontSize: 11.5, color: M.sub, lineHeight: 1.25 }}>{label}</div>
      <div style={val(right, "right")}>{right}</div>
    </div>
  );
}

function MatchStatsTab({ stats, names }) {
  return (
    <div style={{ background: M.card, borderRadius: 16, padding: "12px 12px 6px", boxShadow: M.dropSm }}>
      <Names names={names} />
      {MATCH_STAT_ROWS.map(row => {
        // Rows the aggregate fallback can't fill are hidden rather than zeroed.
        if (!stats.hasLog && row.label.includes("Touches")) return null;
        const left = formatStat(row.kind, row.get(stats.p1));
        const right = formatStat(row.kind, row.get(stats.p2));
        if (left === "—" && right === "—") return null;
        return <StatRow key={row.label} label={row.label} left={left} right={right} />;
      })}
    </div>
  );
}

function ShotStatsTab({ stats, names }) {
  return (
    <>
      {OUTCOME_SECTIONS.map(section => {
        const rows = SHOT_GROUPS
          .map(g => ({
            label: g.label,
            a: shotGroupTotal(stats.p1, g, section.key),
            b: shotGroupTotal(stats.p2, g, section.key),
          }))
          .filter(r => r.a || r.b);
        const totalA = rows.reduce((s, r) => s + r.a, 0);
        const totalB = rows.reduce((s, r) => s + r.b, 0);
        return (
          <div key={section.key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: section.color, textTransform: "uppercase", margin: "0 0 8px 4px" }}>
              {section.label}
            </div>
            <div style={{ background: M.card, borderRadius: 16, padding: "12px 12px 6px", boxShadow: M.dropSm }}>
              {rows.length === 0 ? (
                <div style={{ fontSize: 12.5, color: M.sub, textAlign: "center", padding: "8px 0 14px" }}>
                  Nothing tagged yet.
                </div>
              ) : (
                <>
                  <Names names={names} />
                  {rows.map(r => <StatRow key={r.label} label={r.label} left={String(r.a)} right={String(r.b)} />)}
                  <StatRow label="Total" left={String(totalA)} right={String(totalB)} emphasis />
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function MatchLogTab({ log, names }) {
  // Grouped by set → game, most recent first, so the latest play is at the top.
  const games = [];
  for (const pt of log) {
    const key = `${pt.setNumber}-${pt.gameNumber}`;
    const last = games[games.length - 1];
    if (last && last.key === key) last.points.push(pt);
    else games.push({ key, setNumber: pt.setNumber, gameNumber: pt.gameNumber, points: [pt] });
  }
  if (games.length === 0) {
    return <div style={{ background: M.card, borderRadius: 16, padding: 18, textAlign: "center", fontSize: 13, color: M.sub, boxShadow: M.dropSm }}>No points logged yet 🎾</div>;
  }
  return (
    <>
      {[...games].reverse().map(g => {
        const last = g.points[g.points.length - 1];
        return (
          <div key={g.key} style={{ background: M.card, borderRadius: 16, padding: "11px 13px", marginBottom: 9, boxShadow: M.dropSm }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13, color: M.ink }}>
                Set {g.setNumber} · Game {g.gameNumber}
              </span>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 12.5, color: M.limeDim }}>
                {last.pOneSetScore}-{last.pTwoSetScore}
              </span>
            </div>
            {g.points.map((pt, i) => {
              const p1Won = String(pt.whoWonPoint) === "1";
              const bits = [
                OUTCOME_LABEL[pt.pointWonType] || null,
                pt.pointShotType && SHOT_LABEL[pt.pointShotType] ? SHOT_LABEL[pt.pointShotType] : null,
                pt.rallyLength != null ? `${pt.rallyLength} shots` : null,
              ].filter(Boolean);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: i ? `1px solid ${M.divider}` : "none" }}>
                  <span style={{
                    flexShrink: 0, width: 18, height: 18, borderRadius: 6, fontSize: 10, fontWeight: 700,
                    fontFamily: M.display, display: "flex", alignItems: "center", justifyContent: "center",
                    color: p1Won ? M.deepGreen : "#fff", background: p1Won ? M.limeDim : "#f0736e",
                  }}>{p1Won ? "1" : "2"}</span>
                  <span style={{ flexShrink: 0, fontSize: 11.5, fontFamily: M.display, fontWeight: 700, color: M.sub, width: 52 }}>
                    {pt.pOneGameScore}-{pt.pTwoGameScore}
                  </span>
                  <span style={{ flex: 1, fontSize: 11.5, color: "#5f7168", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {bits.join(" · ") || "point"}
                  </span>
                  {String(pt.whoServed) === "1" && <span style={{ fontSize: 9, color: M.muted }} title={`${names.p1} serving`}>🎾</span>}
                  {Number(pt.breakPoint) === 1 && <span style={{ fontSize: 8.5, fontWeight: 700, color: M.warn }}>BP</span>}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

export default function MatchStatsView({ stats, names, log = [], initialTab = "match" }) {
  const [tab, setTab] = useState(initialTab);
  const available = TABS.filter(t => (t.id === "match" ? true : stats.hasLog));
  const active = available.some(t => t.id === tab) ? tab : "match";

  return (
    <>
      <div style={{ display: "flex", gap: 6, background: M.fillAlt, borderRadius: 14, padding: 4, marginBottom: 12 }}>
        {available.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            cursor: "pointer", flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: 11,
            fontFamily: M.display, fontWeight: 700, fontSize: 12.5, transition: "all .12s",
            background: active === t.id ? M.card : "transparent",
            color: active === t.id ? M.ink : "#6b7d74",
            boxShadow: active === t.id ? M.dropSm : "none",
          }}>{t.emoji} {t.label}</div>
        ))}
      </div>

      {active === "match" && <MatchStatsTab stats={stats} names={names} />}
      {active === "shot" && <ShotStatsTab stats={stats} names={names} />}
      {active === "log" && <MatchLogTab log={log} names={names} />}
    </>
  );
}
