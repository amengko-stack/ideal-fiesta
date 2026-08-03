// ─── MATCH METRIC TRENDS — PURE CORE ─────────────────────────────────────────
// Per-match statistics already exist; what was missing was the season shape of
// them. This module turns a pile of match docs into one metric's time series so
// a chart can show whether a weakness is actually closing.
//
// Stat reading is delegated entirely to priorityMetrics.readMetric, so a trend
// line and a focus-priority target can never disagree about what "2nd serve
// points won" means — including its minSample guard: an unevaluable match is
// left out of the series rather than plotted as a misleading dip.

import { PRIORITY_METRICS, readMetric } from "./priorityMetrics.js";

// ── TREND_METRICS ────────────────────────────────────────────────────────────
// The curated shortlist offered in the UI picker. All 14 priority metrics can be
// charted, but most are diagnostic detail; these five are the ones a developing
// junior's season is actually judged on.
export const TREND_METRICS = [
  "firstServePct",
  "secondServePointsWonPct",
  "wueRatio",
  "unforcedErrors",
  "rallyWinPct5to8",
];

// ── metricSeries ─────────────────────────────────────────────────────────────
// Pure. One metric across every match that can answer for it, OLDEST FIRST so
// it plots left-to-right. Matches below the metric's minSample are dropped.
export function metricSeries(matches, metricId) {
  if (!PRIORITY_METRICS[metricId]) return [];
  return (matches || [])
    .filter(m => m?.matchStartTime)
    .sort((a, b) => String(a.matchStartTime).localeCompare(String(b.matchStartTime)))
    .map(m => ({
      matchId: m.id ?? m.matchId ?? null,
      date: String(m.matchStartTime).slice(0, 10),
      opponent: m.opponentName || null,
      won: m.whoWonMatch === 1,
      value: readMetric(m, metricId),
    }))
    .filter(p => p.value != null);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ── trendSummary ─────────────────────────────────────────────────────────────
// Pure. Reduces a series to what a card can state in one line.
//
// Direction compares the mean of the older half against the newer half rather
// than first-vs-last: single-match tennis stats swing wildly, and one blowout
// would otherwise read as a season trend. `higherIsBetter` is respected, so
// "improving" always means genuinely better — falling unforced errors included.
//
// Needs 4+ points to call a direction; below that it returns null rather than
// inventing a story from two matches.
export function trendSummary(series, metricId) {
  const def = PRIORITY_METRICS[metricId];
  if (!def || !series?.length) return null;

  const values = series.map(p => p.value);
  const best = def.higherIsBetter ? Math.max(...values) : Math.min(...values);
  const worst = def.higherIsBetter ? Math.min(...values) : Math.max(...values);

  const summary = {
    metricId,
    label: def.label,
    unit: def.unit,
    higherIsBetter: def.higherIsBetter,
    count: series.length,
    first: values[0],
    last: values[values.length - 1],
    avg: +mean(values).toFixed(1),
    best,
    worst,
    delta: +(values[values.length - 1] - values[0]).toFixed(1),
    direction: null,
    change: null,
  };

  if (values.length < 4) return summary;

  const split = Math.floor(values.length / 2);
  const older = mean(values.slice(0, split));
  const newer = mean(values.slice(split));
  const change = +(newer - older).toFixed(1);
  const gain = def.higherIsBetter ? change : -change;

  // A threshold, not a sign test: ratio metrics like W:UE move in tenths, so
  // scale it to the metric's own spread instead of using one flat number.
  const spread = Math.max(...values) - Math.min(...values);
  const noise = Math.max(spread * 0.1, def.unit === "%" ? 1 : 0.1);

  summary.change = change;
  summary.direction = gain > noise ? "improving" : gain < -noise ? "declining" : "flat";
  return summary;
}

// ── describeTrend ────────────────────────────────────────────────────────────
// Pure. The sentence under the chart, e.g. "2nd serve pts won is improving —
// 38% average over 7 matches, up 6.2 since the start of the season."
export function describeTrend(summary) {
  if (!summary) return "";
  const { label, unit, avg, count, direction, change } = summary;
  const matchWord = `${count} match${count === 1 ? "" : "es"}`;
  if (!direction) return `${label}: ${avg}${unit} average over ${matchWord} — too few to call a trend yet.`;

  const size = Math.abs(change);
  const verb = direction === "improving" ? "improving" : direction === "declining" ? "slipping" : "holding steady";
  const tail = direction === "flat"
    ? ""
    : ` — ${direction === "improving" ? "better" : "worse"} by ${size}${unit} in the recent half of the season`;
  return `${label} is ${verb}: ${avg}${unit} average over ${matchWord}${tail}.`;
}
