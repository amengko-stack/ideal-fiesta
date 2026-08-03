import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import TrendChart from "../ui/TrendChart.jsx";
import { computeLoad, computeLoadHistory, acwrStatus, sessionSRPE, computeMonotonyStrain, monotonyStatus } from "../lib/load.js";
import { getWeekBounds } from "../lib/dates.js";

const fmtWeekLabel = (weekStart) => {
  const d = new Date(weekStart);
  return Number.isNaN(d.getTime()) ? weekStart : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};

const SPORT = [
  { key: "tennis",   label: "Tennis",   color: M.tennis },
  { key: "match",    label: "Match",    color: M.match },
  { key: "strength", label: "Strength", color: M.strength },
  { key: "cheer",    label: "Cheer",    color: M.cheer },
  { key: "other",    label: "Other",    color: M.other },
];

const TIP = {
  danger:  "Way high — take it easy today. Recovery is training too. 🧘",
  warn:    "Trending high — ease off intensity for a day or two.",
  limeDim: "You can handle a bit more — good week to progress.",
  success: "Nicely balanced — keep the rhythm going! 🎾",
  muted:   "Log a few sessions to see your load picture.",
};

const sportOf = (type) => SPORT.find(s => s.key === type) || SPORT[4];

const sessionName = (log) =>
  log.type === "match" ? `Match — ${log.result === "W" ? "Win 🏆" : log.result === "L" ? "Loss" : "played"}`
  : log.type === "other" ? (log.sportName || "Other sport")
  : `${sportOf(log.type).label} session`;

export default function LoadScreen({ weekLogs }) {
  const logs = weekLogs || [];
  const { thisWeekSRPE, acwr } = computeLoad(logs);
  const status = acwrStatus(acwr);
  const tone = M.tone[status.tone];

  const { monotony, strain } = computeMonotonyStrain(logs);
  const monoStatus = monotonyStatus(monotony);
  const monoTone = monoStatus ? M.tone[monoStatus.tone] : M.muted;

  const history = computeLoadHistory(logs, 4);
  const labels = ["3w", "2w", "1w", "Now"];
  const maxWeek = Math.max(...history.map(w => w.totalSrpe), 1);

  const acwrPoints = computeLoadHistory(logs, 12)
    .filter(w => w.acwr != null)
    .map(w => ({ label: fmtWeekLabel(w.weekStart), value: w.acwr }));

  const current = history[3].srpeByType;
  const breakdown = SPORT.filter(s => current[s.key] > 0);
  const maxSport = Math.max(...breakdown.map(s => current[s.key]), 1);

  const { start: weekStart } = getWeekBounds(0);
  const thisWeek = logs
    .filter(l => l.date >= weekStart)
    .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));

  return (
    <>
      {/* hero */}
      <Card style={{ borderRadius: 24, padding: 20, boxShadow: M.dropLg }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 46, lineHeight: 0.85, color: M.ink }}>
              {Math.round(thisWeekSRPE).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: M.sub, fontWeight: 600, marginTop: 4 }}>sRPE this week</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              display: "inline-block", fontFamily: M.display, fontWeight: 700, fontSize: 13,
              padding: "5px 12px", borderRadius: 999, background: `${tone}22`, color: tone,
            }}>{status.label}</div>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginTop: 6 }}>
              ACWR {acwr == null ? "—" : acwr.toFixed(2)}
            </div>
          </div>
        </div>
        <div style={{
          background: "#F1F8F3", borderLeft: `3px solid ${tone}`, borderRadius: "0 10px 10px 0",
          padding: "11px 13px", fontSize: 12.5, color: "#4a5a52", marginTop: 16, lineHeight: 1.45, fontWeight: 500,
        }}>{TIP[status.tone]}</div>
      </Card>

      {/* monotony & strain */}
      <Card style={{ padding: "16px 16px", display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: M.ink }}>
            {monotony == null ? "—" : monotony.toFixed(2)}
          </div>
          <div style={{ fontSize: 10.5, color: M.sub, fontWeight: 600, marginTop: 2 }}>Monotony</div>
          {monoStatus && (
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 11.5, color: monoTone, marginTop: 4 }}>
              {monoStatus.label}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: M.ink }}>
            {strain == null ? "—" : strain.toLocaleString()}
          </div>
          <div style={{ fontSize: 10.5, color: M.sub, fontWeight: 600, marginTop: 2 }}>Strain</div>
        </div>
      </Card>
      {monoStatus && (monoStatus.tone === "warn" || monoStatus.tone === "danger") && (
        <div style={{
          background: "#FDF3E3", borderLeft: `3px solid ${monoTone}`, borderRadius: "0 10px 10px 0",
          padding: "9px 13px", fontSize: 12, color: "#4a5a52", marginBottom: 10, lineHeight: 1.4, fontWeight: 500,
        }}>Mix harder and easier days — same-load days raise injury risk.</div>
      )}

      {/* 4-week bars */}
      <Card style={{ padding: "18px 16px" }}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 16 }}>4-week load</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 96 }}>
          {history.map((w, i) => (
            <div key={w.weekStart} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, height: "100%", justifyContent: "flex-end" }}>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 12, color: "#5f7168" }}>
                {Math.round(w.totalSrpe).toLocaleString()}
              </span>
              <div style={{
                width: "100%",
                height: `${Math.max(10, Math.round((w.totalSrpe / maxWeek) * 100))}%`,
                borderRadius: "8px 8px 4px 4px",
                background: i === 3 ? `linear-gradient(180deg,${M.ringGradFrom},${M.ringGradTo})` : "#DCEAE0",
              }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: M.muted }}>{labels[i]}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 12-week ACWR trend */}
      <Card style={{ padding: "18px 16px" }}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 6 }}>12-week ACWR</div>
        <TrendChart points={acwrPoints} />
      </Card>

      {/* breakdown */}
      <Card style={{ padding: "18px 16px" }}>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 15, color: M.ink, marginBottom: 16 }}>Where the load comes from</div>
        {breakdown.length === 0 && (
          <div style={{ textAlign: "center", color: M.sub, fontSize: 13, padding: "8px 0" }}>Nothing logged this week yet — tap ＋ to get started 🎾</div>
        )}
        {breakdown.map(s => (
          <div key={s.key} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: M.display, fontWeight: 600, fontSize: 13, color: M.ink }}>{s.label}</span>
              <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13, color: "#5f7168" }}>{Math.round(current[s.key]).toLocaleString()}</span>
            </div>
            <div style={{ height: 12, borderRadius: 99, background: M.fillDim, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((current[s.key] / maxSport) * 100)}%`, height: "100%", borderRadius: 99, background: s.color }} />
            </div>
          </div>
        ))}
      </Card>

      {/* this week's sessions */}
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink, marginBottom: 9, paddingLeft: 2 }}>This week's sessions</div>
      {thisWeek.length === 0 && (
        <Card style={{ textAlign: "center", color: M.sub, fontSize: 13 }}>No sessions this week yet.</Card>
      )}
      {thisWeek.map(log => {
        const sport = sportOf(log.type);
        return (
          <div key={log.id} style={{
            display: "flex", alignItems: "center", gap: 11, background: M.card, borderRadius: 14,
            padding: "11px 13px", marginBottom: 8, boxShadow: M.dropSm,
          }}>
            <span style={{
              flexShrink: 0, padding: "4px 11px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
              letterSpacing: ".03em", textTransform: "uppercase", fontFamily: M.display,
              background: `${sport.color}33`, color: "#173a2f",
            }}>{sport.label}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink }}>{sessionName(log)}</div>
              <div style={{ fontSize: 11, color: M.sub }}>{log.duration} min · {log.rpe != null ? `RPE ${log.rpe}` : `intensity ${log.intensity}/5`}</div>
            </div>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 13, color: M.success }}>{Math.round(sessionSRPE(log))}</span>
          </div>
        );
      })}
    </>
  );
}
