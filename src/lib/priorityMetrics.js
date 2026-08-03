// ─── FOCUS PRIORITY METRIC TARGETS — PURE CORE ───────────────────────────────
// A deferred priority raised off a match statistic ("2nd serve points won is
// only 31%") carries a machine-checkable target. This module reads those
// numbers back out of a match doc and decides whether the target has been met.
// No Firestore import — the wiring lives in deferredPriorities.js.
//
// The match shape is the canonical one produced by extractMatchData (plist.js);
// finalizeMatch (liveScoring.js) routes live matches through the same builder,
// so one reader covers imported and live-scored matches alike.

const v   = (m) => m?.valissa    || {};
const cal = (m) => m?.calculated || {};

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

// firstServePct is stored as a fraction by some importers and a percentage by
// others — matchAnalysis.js normalizes the same way when building its prompt.
const asPct = (x) => {
  const n = num(x);
  if (n == null) return null;
  return n <= 1 ? n * 100 : n;
};

const sum = (...xs) => xs.reduce((a, b) => a + (num(b) ?? 0), 0);

const servePoints  = (m) => sum(v(m).firstServePoints, v(m).secondServePoints);
const shotPoints   = (m) => sum(v(m).winners, v(m).unforcedErrors, v(m).forcedErrors);
const returnPoints = (m) => sum(v(m).firstReturnPoints, v(m).secondReturnPoints);
const rally        = (m, bucket) => cal(m).rallyDistribution?.[bucket] || {};

// ── PRIORITY_METRICS ─────────────────────────────────────────────────────────
// `minSample` is the guard that matters most: 2 of 3 second serves won reads as
// 67% and would silently clear a genuine second-serve weakness. Below the
// threshold the metric reads null and the match simply doesn't count.
export const PRIORITY_METRICS = {
  firstServePct: {
    label: "1st serve in", unit: "%", higherIsBetter: true, minSample: 10,
    read: (m) => asPct(v(m).firstServePct), sample: servePoints,
  },
  firstServePointsWonPct: {
    label: "1st serve pts won", unit: "%", higherIsBetter: true, minSample: 8,
    read: (m) => num(cal(m).firstServePointsWonPct)
      ?? (num(v(m).firstServePoints) > 0 ? (sum(v(m).firstServePointsWon) / v(m).firstServePoints) * 100 : null),
    sample: (m) => sum(v(m).firstServePoints),
  },
  secondServePointsWonPct: {
    label: "2nd serve pts won", unit: "%", higherIsBetter: true, minSample: 6,
    read: (m) => num(cal(m).secondServePointsWonPct)
      ?? (num(v(m).secondServePoints) > 0 ? (sum(v(m).secondServePointsWon) / v(m).secondServePoints) * 100 : null),
    sample: (m) => sum(v(m).secondServePoints),
  },
  doubleFaults: {
    label: "double faults", unit: "", higherIsBetter: false, minSample: 10,
    read: (m) => num(v(m).doubleFaults), sample: servePoints,
  },
  aces: {
    label: "aces", unit: "", higherIsBetter: true, minSample: 10,
    read: (m) => num(v(m).aces), sample: servePoints,
  },
  winners: {
    label: "winners", unit: "", higherIsBetter: true, minSample: 10,
    read: (m) => num(v(m).winners), sample: shotPoints,
  },
  unforcedErrors: {
    label: "unforced errors", unit: "", higherIsBetter: false, minSample: 10,
    read: (m) => num(v(m).unforcedErrors), sample: shotPoints,
  },
  wueRatio: {
    label: "winner:unforced ratio", unit: "", higherIsBetter: true, minSample: 10,
    read: (m) => num(cal(m).wueRatio), sample: shotPoints,
  },
  rallyWinPct0to4: {
    label: "0–4 shot rally win", unit: "%", higherIsBetter: true, minSample: 6,
    read: (m) => num(rally(m, "0-4").valissaWinPct), sample: (m) => sum(rally(m, "0-4").total),
  },
  rallyWinPct5to8: {
    label: "5–8 shot rally win", unit: "%", higherIsBetter: true, minSample: 6,
    read: (m) => num(rally(m, "5-8").valissaWinPct), sample: (m) => sum(rally(m, "5-8").total),
  },
  rallyWinPct9plus: {
    label: "9+ shot rally win", unit: "%", higherIsBetter: true, minSample: 6,
    read: (m) => num(rally(m, "9+").valissaWinPct), sample: (m) => sum(rally(m, "9+").total),
  },
  forehandErrors: {
    label: "forehand errors", unit: "", higherIsBetter: false, minSample: 10,
    read: (m) => num(v(m).fhError), sample: shotPoints,
  },
  backhandErrors: {
    label: "backhand errors", unit: "", higherIsBetter: false, minSample: 10,
    read: (m) => num(v(m).bhError), sample: shotPoints,
  },
  returnErrors: {
    label: "return errors", unit: "", higherIsBetter: false, minSample: 10,
    read: (m) => sum(v(m).fhReturnError, v(m).bhReturnError), sample: returnPoints,
  },
};

export const METRIC_IDS = Object.keys(PRIORITY_METRICS);

const COMPARATORS = {
  ">=": (a, b) => a >= b,
  ">":  (a, b) => a >  b,
  "<=": (a, b) => a <= b,
  "<":  (a, b) => a <  b,
  "==": (a, b) => a === b,
};

const COMPARATOR_SYMBOL = { ">=": "≥", ">": ">", "<=": "≤", "<": "<", "==": "=" };

// ── isMetricTarget ───────────────────────────────────────────────────────────
// Pure. Guards against a malformed target coming back from the model — an
// unknown metric id or comparator must never silently resolve a priority.
export function isMetricTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (!PRIORITY_METRICS[target.metric]) return false;
  if (!COMPARATORS[target.comparator]) return false;
  return typeof target.value === "number" && Number.isFinite(target.value);
}

// ── readMetric ───────────────────────────────────────────────────────────────
// Pure. The metric's value for this match, or null when the stat is missing or
// the sample is too small to mean anything.
export function readMetric(match, metricId) {
  const def = PRIORITY_METRICS[metricId];
  if (!def || !match) return null;
  if (sum(def.sample(match)) < def.minSample) return null;
  const value = def.read(match);
  return value == null ? null : +value.toFixed(1);
}

// ── targetMet ────────────────────────────────────────────────────────────────
// Pure. true / false / null, where null means "this match can't answer the
// question" — it neither satisfies the target nor breaks a streak.
export function targetMet(match, target) {
  if (!isMetricTarget(target)) return null;
  const value = readMetric(match, target.metric);
  if (value == null) return null;
  return COMPARATORS[target.comparator](value, target.value);
}

// ── describeTarget ───────────────────────────────────────────────────────────
// Pure. The human string for the Focus priorities card, e.g.
// "2nd serve pts won ≥ 45%". Returns "" for a target we can't evaluate, so the
// UI shows nothing rather than a half-rendered promise.
export function describeTarget(target) {
  if (!isMetricTarget(target)) return "";
  const def = PRIORITY_METRICS[target.metric];
  return `${def.label} ${COMPARATOR_SYMBOL[target.comparator]} ${target.value}${def.unit}`;
}

// ── describeMetricValue ──────────────────────────────────────────────────────
// Pure. Renders the current reading for the UI, or "" when unavailable.
export function describeMetricValue(match, metricId) {
  const value = readMetric(match, metricId);
  if (value == null) return "";
  return `${value}${PRIORITY_METRICS[metricId]?.unit ?? ""}`;
}

export const REQUIRED_STREAK = 2;

// ── streakMet ────────────────────────────────────────────────────────────────
// Pure. Walks matches NEWEST FIRST and decides whether the target has held in
// the last `streak` matches that could actually be evaluated. Matches with too
// small a sample are skipped rather than counted as failures — otherwise a
// short dead-rubber match would reset the athlete's progress.
// Returns { met, evaluated, matchIds }.
export function streakMet(matchesNewestFirst, target, streak = REQUIRED_STREAK) {
  const result = { met: false, evaluated: 0, matchIds: [] };
  if (!isMetricTarget(target)) return result;

  for (const match of matchesNewestFirst || []) {
    const verdict = targetMet(match, target);
    if (verdict == null) continue;          // not evaluable — skip, don't break
    result.evaluated += 1;
    if (!verdict) return result;            // a real miss ends it immediately
    result.matchIds.push(match.id ?? match.matchId ?? null);
    if (result.evaluated >= streak) {
      result.met = true;
      return result;
    }
  }
  return result;
}

// ── toISO ────────────────────────────────────────────────────────────────────
// Pure. Firestore Timestamp | ISO string | Date → ISO string. Match dates are
// stored as ISO strings and deferredDate as a Timestamp, so comparing the two
// needs one coercion both the resolver and the UI can share.
export function toISO(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── matchesSince ─────────────────────────────────────────────────────────────
// Pure. Matches played strictly after `sinceISO`, newest first. A priority can
// only be cleared by matches played after it was raised — an old good match
// must not resolve a problem identified last week.
export function matchesSince(matches, sinceISO) {
  const since = sinceISO ? String(sinceISO) : null;
  return (matches || [])
    .filter(m => m?.matchStartTime && (!since || String(m.matchStartTime) > since))
    .sort((a, b) => String(b.matchStartTime).localeCompare(String(a.matchStartTime)));
}
