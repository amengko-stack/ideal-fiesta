import { M } from "../styles/mobileTheme.js";

const TABS = [
  { id: "home",    icon: "🏠", label: "Home" },
  { id: "load",    icon: "📊", label: "Load" },
  { id: "matches", icon: "🎾", label: "Matches" },
  { id: "plan",    icon: "📋", label: "Plan" },
];

function NavItem({ tab, active, onNav }) {
  return (
    <div onClick={() => onNav(tab.id)} style={{
      cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center",
      gap: 3, fontSize: 11, fontFamily: M.body,
      fontWeight: active ? 700 : 600, color: active ? M.success : M.muted,
    }}>
      <span style={{ fontSize: 19 }}>{tab.icon}</span>{tab.label}
    </div>
  );
}

export default function BottomNav({ active, onNav, onFab }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, display: "flex", justifyContent: "center" }}>
      <div style={{
        width: "100%", maxWidth: 480, height: 84, background: "rgba(253,251,243,0.94)",
        backdropFilter: "blur(10px)", borderTop: `1px solid ${M.dividerAlt}`,
        display: "flex", alignItems: "flex-start", justifyContent: "space-around",
        padding: "12px 20px 0", paddingBottom: "env(safe-area-inset-bottom)", boxSizing: "content-box",
      }}>
        <NavItem tab={TABS[0]} active={active === "home"} onNav={onNav} />
        <NavItem tab={TABS[1]} active={active === "load"} onNav={onNav} />
        <div onClick={onFab} style={{
          cursor: "pointer", width: 56, height: 56, borderRadius: 19, background: M.gradient,
          display: "flex", alignItems: "center", justifyContent: "center", marginTop: -22,
          boxShadow: `0 6px 0 ${M.brandShadow}, 0 10px 20px rgba(0,229,160,.35)`,
        }}>
          <span style={{ fontSize: 30, color: M.deepGreen, fontWeight: 700, lineHeight: 1, marginTop: -3 }}>+</span>
        </div>
        <NavItem tab={TABS[2]} active={active === "matches"} onNav={onNav} />
        <NavItem tab={TABS[3]} active={active === "plan"} onNav={onNav} />
      </div>
    </div>
  );
}
