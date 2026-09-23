import { M } from "../styles/mobileTheme.js";

// Short toasts still render as one centred pill. A longer one wraps inside the
// screen: it used to be `white-space: nowrap` centred with translateX(-50%),
// so anything wider than the phone lost BOTH ends — for an error that is the
// "failed" at the start of the sentence. `width: max-content` keeps the
// shrink-to-fit width from collapsing to the 50% left offset.
export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)",
      background: M.darkCard, color: M.lime, fontFamily: M.display, fontWeight: 700,
      fontSize: 14, padding: "12px 20px", borderRadius: 22,
      boxShadow: "0 8px 24px rgba(18,49,42,.25)",
      width: "max-content", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box",
      whiteSpace: "normal", textAlign: "center",
      animation: "toastPop .35s ease", zIndex: 40,
    }}>{message}</div>
  );
}
