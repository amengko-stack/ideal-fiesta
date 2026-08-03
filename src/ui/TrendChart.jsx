import { useState } from "react";
import { M } from "../styles/mobileTheme.js";

// ─── TRENDCHART — presentational sparkline/line chart ────────────────────────
// Dependency-free inline SVG. Auto-scales to the data (no forced 0 baseline —
// a metric living in a tight band like 55–75% must not get squashed into the
// bottom third). Renders only the min/max y-labels and first/last x-labels;
// a 12-point chart with a label under every point is unreadable on a phone.
// Tapping/clicking a point shows its value below the chart.
export default function TrendChart({ points, unit = "", higherIsBetter, height = 120, color }) {
  const [selected, setSelected] = useState(null);
  const pts = points || [];
  const lineColor = color || defaultColor(pts, higherIsBetter);

  if (pts.length === 0) {
    return (
      <div style={{ textAlign: "center", color: M.sub, fontSize: 12.5, padding: "14px 0" }}>
        Not enough data yet.
      </div>
    );
  }

  const width = 280;
  const padX = 10;
  const padTop = 14;
  // padBottom reserves two stacked rows below the plot: the y-axis minimum and
  // then the date labels. At 20 they printed on top of each other.
  const padBottom = 30;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const values = pts.map(p => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin;
  const pad = span > 0 ? span * 0.15 : Math.max(Math.abs(rawMax) * 0.1, 1);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const xAt = (i) => pts.length === 1 ? padX + plotW / 2 : padX + (i / (pts.length - 1)) * plotW;
  const yAt = (v) => padTop + (1 - (v - min) / range) * plotH;

  const coords = pts.map((p, i) => ({ x: xAt(i), y: yAt(p.value), p }));
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  const active = selected != null ? coords[selected] : coords[coords.length - 1];

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {/* y-axis min/max labels */}
        <text x={padX} y={padTop - 2} fontSize="9" fontWeight="700" fill={M.muted}>{formatVal(max, unit)}</text>
        <text x={padX} y={padTop + plotH + 10} fontSize="9" fontWeight="700" fill={M.muted}>{formatVal(min, unit)}</text>

        {pts.length > 1 && (
          <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={selected === i ? 5 : 3.5}
            fill={selected === i ? lineColor : M.card}
            stroke={lineColor}
            strokeWidth="2"
            style={{ cursor: "pointer" }}
            onClick={() => setSelected(i)}
            onMouseEnter={() => setSelected(i)}
          />
        ))}

        {/* x-axis first/last labels */}
        <text x={coords[0].x} y={height - 4} fontSize="9" fontWeight="700" fill={M.muted} textAnchor={pts.length === 1 ? "middle" : "start"}>
          {coords[0].p.label}
        </text>
        {pts.length > 1 && (
          <text x={coords[coords.length - 1].x} y={height - 4} fontSize="9" fontWeight="700" fill={M.muted} textAnchor="end">
            {coords[coords.length - 1].p.label}
          </text>
        )}
      </svg>
      {active && (
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 12, color: M.ink, fontWeight: 600 }}>
          {active.p.label}: <span style={{ fontFamily: M.display, fontWeight: 700 }}>{formatVal(active.p.value, unit)}</span>
        </div>
      )}
    </div>
  );
}

// When no explicit color is given and we know which direction is "better",
// tint the line by whether the series moved that way overall.
function defaultColor(pts, higherIsBetter) {
  if (typeof higherIsBetter !== "boolean" || pts.length < 2) return M.tennis;
  const change = pts[pts.length - 1].value - pts[0].value;
  const gain = higherIsBetter ? change : -change;
  if (gain > 0) return M.success;
  if (gain < 0) return M.danger;
  return M.tennis;
}

function formatVal(v, unit) {
  const n = Math.round(v * 10) / 10;
  return `${n}${unit || ""}`;
}
