import { M } from "../styles/mobileTheme.js";
import Card from "../ui/Card.jsx";
import { computeLoad, readinessScore, acwrStatus, mergeWellbeingByDate } from "../lib/load.js";
import { levelFromXp } from "../lib/gamification.js";
import { toLocalDateStr } from "../lib/dates.js";

const SPORT = {
  tennis:   { label: "Tennis",   color: M.tennisLight },
  match:    { label: "Match",    color: M.match },
  strength: { label: "Strength", color: M.strength },
  cheer:    { label: "Cheer",    color: M.cheer },
  other:    { label: "Other",    color: M.other },
};

export default function HomeScreen({ weekLogs, wellbeing, xp, activeThisWeek, streak, onOpenCheckin }) {
  const today = toLocalDateStr(new Date());
  const todayWb = mergeWellbeingByDate(wellbeing || [])[today];
  const readiness = readinessScore(todayWb?.mood, todayWb?.soreness);
  const { thisWeekSRPE, acwr } = computeLoad(weekLogs || []);
  const status = acwrStatus(acwr);
  const lv = levelFromXp(xp);

  const c = 2 * Math.PI * 50;
  const off = readiness == null ? c : c * (1 - readiness / 100);
  const readyLabel = readiness == null ? "Check in to see your energy"
    : readiness >= 75 ? "Fully charged!" : readiness >= 55 ? "Good to go!" : "Recharge day";
  const energySub = todayWb
    ? `Mood ${todayWb.mood ?? "—"}/5 · slept ${todayWb.sleep ?? "—"}h · ${streak}-day streak 🔥`
    : "No check-in yet today — tap the card below ✨";

  const recent = [...(weekLogs || [])]
    .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")))
    .slice(0, 4);

  const tileNum = (color) => ({ fontFamily: M.display, fontWeight: 700, fontSize: 24, color, lineHeight: 0.9 });
  const tileLabel = { fontSize: 10.5, color: M.sub, fontWeight: 600, marginTop: 4 };
  const toneColor = { success: M.success, warn: M.warn, danger: M.danger, limeDim: M.limeDim, muted: M.muted };

  return (
    <>
      {/* energy hero */}
      <Card style={{ borderRadius: 26, padding: 20, display: "flex", alignItems: "center", gap: 16, boxShadow: M.dropLg }}>
        <div style={{ position: "relative", width: 118, height: 118, flexShrink: 0 }}>
          <svg width="118" height="118" viewBox="0 0 118 118">
            <defs>
              <linearGradient id="engH" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={M.ringGradFrom} /><stop offset="1" stopColor={M.ringGradTo} />
              </linearGradient>
            </defs>
            <circle cx="59" cy="59" r="50" fill="none" stroke={M.dividerAlt} strokeWidth="13" />
            <circle cx="59" cy="59" r="50" fill="none" stroke="url(#engH)" strokeWidth="13" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 59 59)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 36, lineHeight: 0.8, color: M.ink }}>{readiness ?? "—"}</div>
            <div style={{ fontSize: 10, color: M.sub, fontWeight: 700, letterSpacing: ".1em" }}>ENERGY</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: M.ink, lineHeight: 1.05 }}>{readyLabel}</div>
          <div style={{ fontSize: 12.5, color: M.sub, marginTop: 6, lineHeight: 1.45 }}>{energySub}</div>
        </div>
      </Card>

      {/* level / xp */}
      <Card style={{ borderRadius: 22, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.deepGreen, background: M.gradient, padding: "5px 12px", borderRadius: 12 }}>Lvl {lv.level}</span>
            <span style={{ fontFamily: M.display, fontWeight: 600, fontSize: 15, color: M.ink }}>{lv.title}</span>
          </div>
          <span style={{ fontSize: 11, color: M.sub, fontWeight: 600 }}>{lv.toNext} to Lvl {lv.level + 1}</span>
        </div>
        <div style={{ height: 13, borderRadius: 99, background: M.dividerAlt, overflow: "hidden" }}>
          <div style={{ width: `${Math.round((lv.intoLevel / 1000) * 100)}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${M.ringGradFrom},${M.ringGradTo})` }} />
        </div>
        <div style={{ fontSize: 11, color: M.sub, fontWeight: 600, marginTop: 7 }}>{lv.intoLevel} / 1000 XP</div>
      </Card>

      {/* tiles */}
      <div style={{ display: "flex", gap: 11, marginBottom: 14 }}>
        <Card style={{ flex: 1, borderRadius: 18, padding: "14px 12px", marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={tileNum(M.ink)}>{Math.round(thisWeekSRPE).toLocaleString()}</div>
          <div style={tileLabel}>load / wk</div>
        </Card>
        <Card style={{ flex: 1, borderRadius: 18, padding: "14px 12px", marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={tileNum(toneColor[status.tone])}>{acwr == null ? "—" : acwr.toFixed(2)}</div>
          <div style={{ ...tileLabel, color: toneColor[status.tone], fontWeight: 700 }}>{status.label}</div>
        </Card>
        <Card style={{ flex: 1, borderRadius: 18, padding: "14px 12px", marginBottom: 0, boxShadow: M.dropSm }}>
          <div style={tileNum(M.success)}>{activeThisWeek}</div>
          <div style={tileLabel}>days active</div>
        </Card>
      </div>

      {/* check-in card */}
      <Card style={{ cursor: "pointer" }} >
        <div onClick={onOpenCheckin}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink }}>How I'm feeling</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#5c7a0a" }}>tap to update →</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {[
              { emoji: "😊", val: todayWb?.mood ?? "—", label: "Mood", color: M.streakOrange },
              { emoji: "😴", val: todayWb?.sleep != null ? `${todayWb.sleep}h` : "—", label: "Sleep", color: M.success },
              { emoji: "💪", val: todayWb?.soreness ?? "—", label: "Achy", color: M.ink },
            ].map((s, i) => (
              <div key={s.label} style={{ textAlign: "center", flex: 1, borderLeft: i ? `1px solid ${M.dividerAlt}` : "none" }}>
                <div style={{ fontSize: 22 }}>{s.emoji}</div>
                <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 22, color: s.color, marginTop: 2 }}>{s.val}</div>
                <div style={{ fontSize: 10.5, color: M.sub, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* recent */}
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 14, color: M.ink, marginBottom: 9, paddingLeft: 2 }}>Recent</div>
      {recent.length === 0 && (
        <Card style={{ textAlign: "center", color: M.sub, fontSize: 13 }}>No sessions yet — tap ＋ to log your first! 🎾</Card>
      )}
      {recent.map(log => {
        const sport = SPORT[log.type] || SPORT.other;
        const name = log.type === "match" ? `Match — ${log.result === "W" ? "Win 🏆" : log.result === "L" ? "Loss" : "played"}`
          : log.type === "other" ? (log.sportName || "Other sport")
          : `${sport.label} session`;
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
              <div style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.ink }}>{name}</div>
              <div style={{ fontSize: 11, color: M.sub }}>{log.duration} min · {log.rpe != null ? `RPE ${log.rpe}` : `intensity ${log.intensity}/5`}</div>
            </div>
            <span style={{ fontSize: 11, color: M.muted, fontWeight: 700 }}>{log.date === today ? "Today" : log.date.slice(5)}</span>
          </div>
        );
      })}
    </>
  );
}
