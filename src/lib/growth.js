// ─── GROWTH MATH ─────────────────────────────────────────────────────────────
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
