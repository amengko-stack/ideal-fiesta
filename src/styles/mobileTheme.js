// ─── MOBILE DESIGN TOKENS ────────────────────────────────────────────────────
// Values from the product-redesign handoff. Used only by the new UI
// (src/ui, src/screens); the legacy theme stays in theme.js until cutover.

export const M = {
  // brand
  gradient:     "linear-gradient(150deg,#d9f86a,#00e5a0)",
  ringGradFrom: "#c8f564", ringGradTo: "#00e5a0",
  brandShadow:  "#12b585", deepGreen: "#0a2e22",
  // ink
  ink: "#12312a", sub: "#7a8a84", muted: "#9aa8a1",
  divider: "#F1F6F2", dividerAlt: "#E4EFE8",
  // surfaces
  card: "#fff", fill: "#F4F8F5", fillAlt: "#EFF4F1", fillDim: "#EDF3EF",
  sheetBg: "#FDFBF3",
  pageBg: "linear-gradient(180deg,#EDFBF3 0%,#FDFBF3 55%)",
  darkCard: "#12312a", lime: "#d9f86a", limeDim: "#8fd400",
  // status
  success: "#12b585", warn: "#d98a1f", danger: "#e0433f",
  parentBlue: "#2f7fd9", parentBlueBg: "#E4EFFB", streakOrange: "#f59a1f",
  // sports
  tennis: "#a9d40f", tennisLight: "#c8f564", match: "#f5c518",
  strength: "#00c88c", cheer: "#f564c8", other: "#4fb0e8",
  // type
  display: "'Fredoka', sans-serif", body: "'DM Sans', sans-serif",
  // shadows
  drop: "0 4px 0 rgba(18,49,42,0.05)", dropLg: "0 5px 0 rgba(18,49,42,0.06)",
  dropSm: "0 3px 0 rgba(18,49,42,0.04)", cta: "0 5px 0 #12b585",
};

export const mobileCss = `
  @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
  * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
  body { margin: 0; background: #EDFBF3; font-family: 'DM Sans', system-ui, sans-serif; }
  ::-webkit-scrollbar { width: 0; height: 0; }
  @keyframes sheetUp { from { transform: translateY(105%); } to { transform: translateY(0); } }
  @keyframes scrimIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes toastPop { 0% { transform: translate(-50%,20px) scale(.9); opacity: 0; } 60% { transform: translate(-50%,-3px) scale(1.03); } 100% { transform: translate(-50%,0) scale(1); opacity: 1; } }
  @keyframes screenIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
