import { M } from "../styles/mobileTheme.js";

export default function BadgeSheet({ badge, earnedDate }) {
  if (!badge) return null;
  const earned = !!earnedDate;
  return (
    <>
      <div style={{
        width: 92, height: 92, borderRadius: 28, margin: "0 auto 14px", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 46,
        background: earned ? "linear-gradient(150deg,#eefbdf,#e2fbf2)" : M.fillDim,
        filter: earned ? "none" : "grayscale(1)", opacity: earned ? 1 : 0.6,
      }}>{badge.emoji}</div>
      <div style={{ textAlign: "center", fontFamily: M.display, fontWeight: 700, fontSize: 23, color: M.ink }}>{badge.name}</div>
      <div style={{ textAlign: "center", fontSize: 13, color: M.sub, margin: "8px 0 14px", lineHeight: 1.5 }}>{badge.desc}</div>
      <div style={{ textAlign: "center" }}>
        <span style={{
          display: "inline-block", fontFamily: M.display, fontWeight: 700, fontSize: 12.5,
          padding: "5px 13px", borderRadius: 999,
          color: earned ? M.deepGreen : "#8a7420", background: earned ? M.gradient : "#FBEFDD",
        }}>{earned ? `Earned · ${earnedDate}` : `Locked · ${badge.hint}`}</span>
      </div>
    </>
  );
}
