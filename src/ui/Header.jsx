import { M } from "../styles/mobileTheme.js";

export default function Header({ kicker, title, streak, initial, onAvatar }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 16, background: M.gradient,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 25, boxShadow: `0 4px 0 ${M.brandShadow}`,
      }}>🎾</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: M.sub, fontWeight: 600 }}>{kicker}</div>
        <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 24, color: M.ink, lineHeight: 1 }}>{title}</div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 5, background: M.card,
        padding: "8px 13px", borderRadius: 999, boxShadow: "0 3px 0 rgba(18,49,42,0.07)",
      }}>
        <span style={{ fontSize: 15 }}>🔥</span>
        <span style={{ fontFamily: M.display, fontWeight: 700, fontSize: 16, color: M.streakOrange }}>{streak}</span>
      </div>
      <div onClick={onAvatar} style={{
        cursor: "pointer", width: 40, height: 40, borderRadius: 13, background: M.darkCard,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: M.display, fontWeight: 700, fontSize: 17, color: M.lime,
      }}>{initial}</div>
    </div>
  );
}
