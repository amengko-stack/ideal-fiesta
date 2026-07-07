// ─── STYLES ──────────────────────────────────────────────────────────────────
export const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap');`;

export const COLORS = {
  bg: "#0a0e14", surface: "#111620", card: "#161d2a", border: "#1e2a3a",
  accent: "#00e5a0", accentDim: "#00b87a", accentMuted: "rgba(0,229,160,0.12)",
  yellow: "#f5c518", red: "#ff4d6d", text: "#e8edf5", muted: "#5a6a7e",
  tennis: "#c8f564", cheer: "#f564c8"
};

export const css = `
  ${FONTS}
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${COLORS.bg}; color: ${COLORS.text}; font-family: 'DM Sans', sans-serif; min-height: 100vh; }
  .app { max-width: 900px; margin: 0 auto; padding: 0 16px 80px; }
  h1, h2, h3 { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; }
  .header { padding: 16px 0 14px; border-bottom: 1px solid ${COLORS.border}; margin-bottom: 22px; }
  .header h1 { font-size: clamp(1.4rem, 3.5vw, 2rem); color: ${COLORS.accent}; line-height: 1; letter-spacing: 0.06em; }
  .header p { color: ${COLORS.muted}; font-size: 0.9rem; margin-top: 6px; }
  .tabs { display: flex; gap: 4px; background: ${COLORS.surface}; border-radius: 10px; padding: 4px; margin-bottom: 28px; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { flex-shrink: 0; padding: 10px 14px; border: none; border-radius: 7px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 0.8rem; font-weight: 500; color: ${COLORS.muted}; background: transparent; transition: all 0.18s; text-align: center; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .tab.active { background: ${COLORS.accent}; color: #000; font-weight: 600; }
  .card { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .card-title { font-size: 1.1rem; color: ${COLORS.accent}; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; }
  .badge-green { background: rgba(0,229,160,0.15); color: ${COLORS.accent}; }
  .badge-yellow { background: rgba(245,197,24,0.15); color: ${COLORS.yellow}; }
  .badge-red { background: rgba(255,77,109,0.15); color: ${COLORS.red}; }
  .badge-gray { background: rgba(90,106,126,0.2); color: ${COLORS.muted}; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  @media(max-width:640px){ .grid2 { grid-template-columns: 1fr; } .grid3 { grid-template-columns: 1fr; } }
  .label { font-size: 0.75rem; color: ${COLORS.muted}; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 6px; }
  input, select, textarea { width: 100%; padding: 10px 12px; background: ${COLORS.surface}; border: 1px solid ${COLORS.border}; border-radius: 8px; color: ${COLORS.text}; font-family: 'DM Sans', sans-serif; font-size: 0.9rem; outline: none; transition: border 0.15s; }
  input:focus, select:focus, textarea:focus { border-color: ${COLORS.accent}; }
  select option { background: ${COLORS.surface}; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 0.88rem; transition: all 0.15s; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: ${COLORS.accent}; color: #000; }
  .btn-primary:hover:not(:disabled) { background: ${COLORS.accentDim}; }
  .btn-ghost { background: ${COLORS.accentMuted}; color: ${COLORS.accent}; }
  .btn-ghost:hover:not(:disabled) { background: rgba(0,229,160,0.2); }
  .btn-danger { background: rgba(255,77,109,0.12); color: ${COLORS.red}; }
  .btn-sm { padding: 6px 12px; font-size: 0.78rem; }
  .gap-checkbox { display: flex; flex-wrap: wrap; gap: 8px; }
  .gap-chip { padding: 7px 13px; border-radius: 20px; border: 1.5px solid ${COLORS.border}; font-size: 0.8rem; cursor: pointer; transition: all 0.15s; color: ${COLORS.muted}; background: transparent; }
  .gap-chip.selected { border-color: ${COLORS.tennis}; color: ${COLORS.tennis}; background: rgba(200,245,100,0.08); }
  .ex-row { display: flex; align-items: flex-start; gap: 12px; padding: 14px 0; border-bottom: 1px solid ${COLORS.border}; }
  .ex-row:last-child { border-bottom: none; }
  .ex-num { font-family: 'Bebas Neue', sans-serif; font-size: 1.4rem; color: ${COLORS.border}; min-width: 28px; padding-top: 2px; }
  .ex-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 4px; }
  .ex-meta { font-size: 0.78rem; color: ${COLORS.muted}; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .ex-prescription { font-family: 'Bebas Neue', sans-serif; font-size: 1.8rem; color: ${COLORS.accent}; min-width: 90px; text-align: right; line-height: 1; }
  .ex-note { font-size: 0.72rem; color: ${COLORS.accentDim}; }
  .note-box { background: ${COLORS.surface}; border-left: 3px solid ${COLORS.accent}; border-radius: 0 8px 8px 0; padding: 10px 14px; font-size: 0.83rem; color: ${COLORS.muted}; margin-bottom: 12px; }
  .note-box.warn { border-color: ${COLORS.yellow}; }
  .note-box.danger { border-color: ${COLORS.red}; }
  .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid ${COLORS.border}; font-size: 0.88rem; }
  .stat-row:last-child { border-bottom: none; }
  .star-row { display: flex; gap: 6px; }
  .star { font-size: 1.3rem; cursor: pointer; transition: transform 0.1s; filter: grayscale(1); }
  .star.lit { filter: none; transform: scale(1.15); }
  .log-item { background: ${COLORS.surface}; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; font-size: 0.83rem; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; }
  .pill-tennis { background: rgba(200,245,100,0.15); color: ${COLORS.tennis}; }
  .pill-cheer { background: rgba(245,100,200,0.15); color: ${COLORS.cheer}; }
  .pill-strength { background: rgba(0,229,160,0.12); color: ${COLORS.accent}; }
  .pill-other { background: rgba(245,197,24,0.15); color: ${COLORS.yellow}; }
  .load-bar-wrap { height: 8px; background: ${COLORS.surface}; border-radius: 4px; overflow: hidden; margin-top: 6px; }
  .load-bar { height: 100%; border-radius: 4px; transition: width 0.4s; }
  .section-label { font-family: 'Bebas Neue', sans-serif; font-size: 0.85rem; letter-spacing: 0.1em; color: ${COLORS.muted}; margin: 18px 0 10px; }
  .flex { display: flex; align-items: center; gap: 10px; }
  .flex-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .mt8 { margin-top: 8px; }
  .mt16 { margin-top: 16px; }
  .empty { text-align: center; color: ${COLORS.muted}; padding: 32px 0; font-size: 0.9rem; }
  .prog-table { width: 100%; font-size: 0.82rem; border-collapse: collapse; }
  .prog-table th { text-align: left; color: ${COLORS.muted}; font-weight: 500; padding: 8px 6px 10px; border-bottom: 1px solid ${COLORS.border}; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .prog-table td { padding: 10px 6px; border-bottom: 1px solid ${COLORS.border}; vertical-align: middle; }
  .prog-table tr:last-child td { border-bottom: none; }
  .spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid ${COLORS.border}; border-top-color: ${COLORS.accent}; border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .athlete-row { cursor: pointer; transition: background 0.15s; }
  .athlete-row:hover { background: ${COLORS.border}; border-radius: 8px; }
  .av-big-label { font-size: 1rem; font-weight: 600; color: ${COLORS.text}; margin-bottom: 8px; }
  .av-hint { font-size: 0.78rem; color: ${COLORS.muted}; margin-bottom: 10px; }
`;
