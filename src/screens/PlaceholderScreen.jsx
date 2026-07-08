import Card from "../ui/Card.jsx";
import { M } from "../styles/mobileTheme.js";

export default function PlaceholderScreen({ emoji, title, note }) {
  return (
    <Card style={{ textAlign: "center", padding: "44px 20px" }}>
      <div style={{ fontSize: 44, marginBottom: 10 }}>{emoji}</div>
      <div style={{ fontFamily: M.display, fontWeight: 700, fontSize: 20, color: M.ink }}>{title}</div>
      <div style={{ fontSize: 13, color: M.sub, marginTop: 6, lineHeight: 1.5 }}>{note}</div>
    </Card>
  );
}
