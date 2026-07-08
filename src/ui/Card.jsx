import { M } from "../styles/mobileTheme.js";

export default function Card({ children, style }) {
  return (
    <div style={{ background: M.card, borderRadius: 20, padding: 16, boxShadow: M.drop, marginBottom: 14, ...style }}>
      {children}
    </div>
  );
}
