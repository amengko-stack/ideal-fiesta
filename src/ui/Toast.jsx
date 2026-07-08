import { M } from "../styles/mobileTheme.js";

export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)",
      background: M.darkCard, color: M.lime, fontFamily: M.display, fontWeight: 700,
      fontSize: 14, padding: "12px 20px", borderRadius: 999,
      boxShadow: "0 8px 24px rgba(18,49,42,.25)", whiteSpace: "nowrap",
      animation: "toastPop .35s ease", zIndex: 40,
    }}>{message}</div>
  );
}
