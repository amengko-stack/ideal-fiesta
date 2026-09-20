// ─── GROWTH MATH ─────────────────────────────────────────────────────────────
// Two readings of the same measurement history:
//
//   growthVelocity()      — the original last-two-measurements annualisation.
//                           Kept unchanged because guardianCore.js and MeScreen
//                           already calibrate their thresholds against it.
//   recentGrowthContext() — the longitudinal reading the S&C planner uses. It
//                           deliberately reaches back 4–8 months rather than to
//                           whatever was measured last, because annualising a
//                           three-week gap turns ±0.5 cm of measurement noise
//                           into ±8 cm/year of imaginary growth.
//
// Neither function classifies puberty stage. `growthWatch` is a coaching flag
// ("this athlete has grown quickly lately, so bias towards movement quality")
// and never a statement about peak height velocity or maturity status.

// Height velocity (cm/year) from the athlete's measurement history.
export function growthVelocity(measurements) {
  const withHeight = (measurements || [])
    .filter(m => m.height != null && m.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (withHeight.length < 2) return null;
  const a = withHeight[withHeight.length - 2];
  const b = withHeight[withHeight.length - 1];
  const days = (new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`)) / 86400000;
  if (days <= 0) return null;
  const years = days / 365.25;
  return Math.round(((b.height - a.height) / years) * 10) / 10;
}

// Shortest interval that can carry a confident velocity. Under three months a
// 0.5 cm reading error (shoes, posture, time of day) moves the annualised
// figure by more than 2 cm/year, so anything shorter reports its velocity but
// never sets `sufficientInterval` — and therefore never sets `growthWatch`.
export const MIN_INTERVAL_DAYS = 90;

// The window the comparison measurement is picked from when one is available:
// roughly 4–8 months back, targeting 6.
export const PREFERRED_MIN_INTERVAL_DAYS = 120;
export const PREFERRED_MAX_INTERVAL_DAYS = 245;
const TARGET_INTERVAL_DAYS = 183;

// Above this, recent growth is fast enough to be worth coaching around.
// Mid-childhood growth sits nearer 5–6 cm/year, so 7+ marks a notably quick
// recent phase without asserting anything about where she is in puberty.
export const GROWTH_WATCH_CM_PER_YEAR = 7.0;

export const GROWTH_WATCH_MESSAGE =
  "Rapid recent growth — prioritise movement quality, recovery and gradual load progression.";

const daysBetween = (fromDate, toDate) =>
  Math.round((new Date(`${toDate}T00:00:00`) - new Date(`${fromDate}T00:00:00`)) / 86400000);

// ── recentGrowthContext ──────────────────────────────────────────────────────
// Pure. measurements → {
//   velocityCmYr, intervalDays, latestHeight, priorHeight, latestDate,
//   priorDate, sufficientInterval, growthWatch
// }, or null when no measurement carries a height at all.
//
// Comparison measurement: the one whose gap to the latest reading sits in the
// 4–8 month window and is closest to 6 months. When nothing falls in that
// window, the longest available gap is used instead — a two-month gap still
// tells you something, it just does not earn `sufficientInterval`.
export function recentGrowthContext(measurements) {
  const withHeight = (measurements || [])
    .filter(m => m && m.date && Number.isFinite(Number(m.height)))
    .map(m => ({ date: m.date, height: Number(m.height) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (withHeight.length === 0) return null;

  const latest = withHeight[withHeight.length - 1];
  const earlier = withHeight
    .slice(0, -1)
    .filter(m => m.date !== latest.date)
    .map(m => ({ ...m, intervalDays: daysBetween(m.date, latest.date) }))
    .filter(m => m.intervalDays > 0);

  const base = {
    velocityCmYr: null,
    intervalDays: null,
    latestHeight: latest.height,
    priorHeight: null,
    latestDate: latest.date,
    priorDate: null,
    sufficientInterval: false,
    growthWatch: false,
  };

  if (earlier.length === 0) return base;

  const inWindow = earlier.filter(
    m => m.intervalDays >= PREFERRED_MIN_INTERVAL_DAYS && m.intervalDays <= PREFERRED_MAX_INTERVAL_DAYS
  );
  const prior = inWindow.length > 0
    ? inWindow.reduce((best, m) =>
        Math.abs(m.intervalDays - TARGET_INTERVAL_DAYS) < Math.abs(best.intervalDays - TARGET_INTERVAL_DAYS) ? m : best
      )
    : earlier.reduce((best, m) => (m.intervalDays > best.intervalDays ? m : best));

  const years = prior.intervalDays / 365.25;
  const velocityCmYr = Math.round(((latest.height - prior.height) / years) * 10) / 10;
  const sufficientInterval = prior.intervalDays >= MIN_INTERVAL_DAYS;

  return {
    ...base,
    velocityCmYr,
    intervalDays: prior.intervalDays,
    priorHeight: prior.height,
    priorDate: prior.date,
    sufficientInterval,
    growthWatch: sufficientInterval && velocityCmYr >= GROWTH_WATCH_CM_PER_YEAR,
  };
}

// ── growthSummaryLine ────────────────────────────────────────────────────────
// Pure. The one-line growth read-out the Profile and Plan screens show, e.g.
// "153 cm · +4.5 cm over ~6 months · rapid recent growth". Never names a
// puberty stage.
export function growthSummaryLine(ctx) {
  if (!ctx) return null;
  const parts = [`${ctx.latestHeight} cm`];
  if (ctx.priorHeight != null && ctx.intervalDays != null) {
    const delta = Math.round((ctx.latestHeight - ctx.priorHeight) * 10) / 10;
    const months = Math.round(ctx.intervalDays / 30.44);
    parts.push(`${delta >= 0 ? "+" : ""}${delta} cm over ~${months} month${months === 1 ? "" : "s"}`);
  }
  if (ctx.growthWatch) parts.push("rapid recent growth");
  else if (ctx.velocityCmYr != null && !ctx.sufficientInterval) parts.push("measure again in a few months");
  return parts.join(" · ");
}
