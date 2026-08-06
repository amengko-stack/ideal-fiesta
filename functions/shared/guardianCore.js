import { toLocalDateStr } from "./dates.js";
import { computeLoad, computeMonotonyStrain, sessionSRPE, mergeWellbeingByDate, readinessScore } from "./load.js";
import { openInjuries, injuryDuration, recurringAreas, describeInjury } from "./injuries.js";
import { maturityOffset } from "./maturity.js";
import { growthVelocity } from "./growth.js";

// ─── LOAD & HEALTH GUARDIAN — PURE CORE ──────────────────────────────────────
// A daily risk engine that reads training load, wellbeing, injuries and growth
// *together* and stays silent unless factors from different families stack.
// Its value is being right and rare, not chatty — so the gate, not the factor
// list, is the interesting part of this file.
//
// This is deliberately NOT an extension of reminders.js. `dueReminders` answers
// the stateless question "what is due today?"; the Guardian answers the
// stateful, combinatorial question "is something genuinely wrong?" and
// remembers that it already said so. reminders.js is also structurally
// unshareable (it imports reminderRules.json and fitnessTests.js), while this
// module is copied into functions/shared and runs server-side.
//
// Purity contract: this module may import ONLY dates.js, load.js, injuries.js,
// maturity.js and growth.js. No Firestore, no ai.js, no import.meta.env, no
// reminderRules.json. Enforced by src/lib/sharedSync.test.js (allowlist +
// transitive closure) and the transitive import guard in
// athleteMemoryCore.test.js.
//
// The engine is a pipeline, and the order matters to cost: assessGuardian →
// cooldownDecision → (only then) the LLM. A quiet day must cost zero tokens.

// Bumped whenever the factor table, the gate or the alert schema changes in a
// way that makes an already-written alert doc unreadable to the current UI.
// The card refuses to render an alert from a different engine, so a schema
// change can never render half-migrated.
export const GUARDIAN_ENGINE_VERSION = 1;

// Families that can *trigger* an alert, versus families that only ever add
// weight to someone else's story. `growth` is a modifier because Mid-PHV
// persists for months on end — as a trigger it would leave the Guardian
// permanently one factor away from firing, which is exactly the always-on
// indicator this engine exists to not be. `asymmetry` is reserved for the
// deferred L/R benchmark work; it is listed here so the gate rule is written
// once and stays true when that family arrives.
export const TRIGGER_FAMILIES  = Object.freeze(["load", "recovery", "tissue"]);
export const MODIFIER_FAMILIES = Object.freeze(["growth", "asymmetry"]);

// ─── THRESHOLDS ──────────────────────────────────────────────────────────────
// Every number the engine can fire on, with the reasoning that picked it.
// Frozen because the whole point of a shared const is that server and client
// can never disagree about where the line is.
export const GUARDIAN_THRESHOLDS = Object.freeze({
  // ── load ───────────────────────────────────────────────────────────────────
  // computeLoad puts the acute week *inside* the chronic mean (load.js:22), so
  // the ratio is 4A/(A+3P), not the textbook A/P. That compresses the scale:
  // 1.35 here is roughly +52% over the prior three weeks, and the metric
  // asymptotes at 4.0 no matter how big the spike is. It sits deliberately
  // above the dashboard's own 1.3 "Careful" chip (acwrStatus): the chip is an
  // always-on indicator a parent can glance past, the Guardian buzzes a phone
  // at 6am, so it has to be the stricter of the two.
  acwrSpike: 1.35,
  // The dashboard's "Ease up" line. A ratio this far out is not a hard week,
  // it is a week that does not belong to the same training block as the three
  // before it, so the factor upgrades to the heaviest non-standalone weight.
  acwrSevere: 1.5,
  // A ratio computed against mostly-empty history is arithmetic, not a spike:
  // one logged week after three blank ones reads as 4.0. Requiring 3 of the 4
  // buckets to carry load means there is a real baseline to have jumped from.
  acwrMinNonZeroWeeks: 3,
  // Same number and same strict comparison as reminderRules.highLoadSRPE, so
  // the Guardian and the load reminder can never disagree about what "a high
  // week" is — a parent seeing both must not see two different lines.
  sustainedWeekSRPE: 2000,
  sustainedWeeks: 3,
  // Standard Foster guidance, matching monotonyStatus's "Getting repetitive" /
  // "Too repetitive" bands so the Load screen and the Guardian tell the same
  // story about the same week.
  monotonyHigh: 2.0,
  monotonySevere: 2.5,
  // Monotony is mean ÷ SD, so a week of five identical 20-minute joggies scores
  // as "repetitive" as a week of five identical matches. This floor keeps the
  // factor off weeks where the sameness cannot plausibly hurt anyone. 1200
  // sRPE ≈ three moderate sessions.
  monotonyMinWeekSRPE: 1200,

  // ── recovery ───────────────────────────────────────────────────────────────
  // Soreness is 1-5 and higher is WORSE. 3.5 is the midpoint between "3 —
  // changes how I move" and "4 — can barely train" on the injury severity
  // scale a 12-year-old is already used to answering on. Averaged over three
  // readings so one brutal session does not count as a pattern.
  sorenessHigh: 3.5,
  sorenessReadings: 3,
  // A rising trend only matters once it is rising *towards* something. Without
  // this floor a drift from 1.0 to 1.8 — real, harmless — would carry the same
  // weight as a drift from 2.6 to 3.4.
  sorenessRisingFloor: 3.0,
  // Two halves of a week: enough points for the older/newer split to mean
  // anything, short enough that last month's training camp is not in the mean.
  sorenessTrendReadings: 7,
  // Half a point on a 5-point self-report is about the resolution a child
  // actually answers at; anything smaller is mood, not soreness.
  sorenessNoiseFloor: 0.5,
  // Hours, and matching reminderRules.sleepDeficitHours so the two engines
  // agree on "short sleep". The Guardian's stricter half is the window, not
  // the number: 3 recent readings rather than the reminder's 5-day count, so
  // an acute run of bad nights registers while it is still actionable.
  sleepDeficitHours: 7,
  sleepReadings: 3,
  // Mood is 1-5 and higher is BETTER. Same threshold as
  // reminderRules.moodDeclineThreshold, but restored to the *consecutive*-day
  // test AlertsBanner originally used and the reminder engine had to drop
  // (calculateMetrics only exposes a 7-day average). Three days in a row under
  // it is a trend; one bad day is a bad day.
  moodLow: 2.5,
  moodLowDays: 3,
  // Evidence only — readiness is a blend of the three signals already scored
  // above, so counting it would let one bad morning pay twice. 50 is the
  // midpoint of readinessScore's 0-100 range.
  readinessLow: 50,

  // ── tissue ─────────────────────────────────────────────────────────────────
  // SEVERITY_LABELS: 4 = "can barely train", 5 = "can't train at all". That is
  // the one state where the athlete should not be training on a coach's
  // judgement alone, which is why this factor alone is enough to fire.
  injurySevere: 4,
  // 3 = "changes how I move or hit" — she is training, but compensating, and
  // compensation is how one sore ankle becomes a sore hip.
  injuryModerate: 3,
  // Two weeks. The clock injuryLoadFlag deliberately lacks: it grades an injury
  // by severity alone, so a niggle that has quietly been open since March reads
  // exactly like one reported this morning. Two weeks is long enough that
  // "it'll settle" has been disproven.
  injuryLingeringDays: 14,
  // recurringAreas' own defaults, restated here so the number is visible next
  // to the others rather than hidden in a call site. A third strain in the same
  // calf within six months is not bad luck.
  recurringWithinDays: 180,
  recurringMinCount: 2,

  // ── growth ─────────────────────────────────────────────────────────────────
  // cm/year. growthVelocity annualises from only the last TWO height readings,
  // so the span between them is doing all the work: a 3-week gap with 0.5cm of
  // tape-measure error already yields ~9 cm/yr of pure noise. Hence both
  // numbers — 6.0 cm/yr is genuinely fast for a 12-year-old, but only if it is
  // measured over a window long enough for 6.0 to be a measurement rather than
  // a rounding artefact. growthVelocity does not expose the span, so this
  // module recomputes it from the same two readings.
  growthVelocityHigh: 6.0,
  growthMinSpanDays: 60,

  // ── windows ────────────────────────────────────────────────────────────────
  // Wellbeing docs older than this are history, not today's picture. Also the
  // window fetchGuardianRaw queries, so reading wider here would silently
  // change behaviour between the server and a client replay.
  wellbeingWindowDays: 14,

  // ── the gate ───────────────────────────────────────────────────────────────
  // The whole thesis in two numbers. Two families, because a single family
  // firing on three factors is one story told three ways (that is precisely
  // the bug this engine exists to fix), and weight 4, because two lightweight
  // signals — a mildly repetitive week plus one grumpy morning — are a normal
  // fortnight in the life of a 12-year-old, not an alert.
  minFamilies: 2,
  minTotalWeight: 4,
  // Severity bands over totalWeight. 4 is the floor, so `watch` is exactly the
  // minimum firing case; 6 needs either a severe factor or three families.
  severityUrgent: 6,
  severityConcern: 5,

  // ── cooldown ───────────────────────────────────────────────────────────────
  // Days. Long enough to clear a full training week, so whatever the parent
  // changed has had time to show up in the data before the same story is
  // allowed to speak again. Caps a genuinely persistent story at ~3 alerts a
  // month, which is the difference between a warning and a nag.
  cooldownDays: 10,
  // Escalation override: a story already inside its cooldown speaks again if
  // it got materially worse. Two weight units is one whole factor, not a
  // factor's severity ticking up a notch — that keeps "monotony crossed 2.5"
  // quiet while "and now she is also sleeping badly" gets through.
  escalationWeightJump: 2,
});

const T = GUARDIAN_THRESHOLDS;

// ─── small helpers ───────────────────────────────────────────────────────────

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const arr   = (v) => (Array.isArray(v) ? v.filter(isObj) : []);
const num   = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const mean  = (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);

const validDate = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
};

const shiftDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

// Whole days between two YYYY-MM-DD strings, or null if either is unparseable.
const daysBetween = (fromStr, toStr) => {
  if (typeof fromStr !== "string" || typeof toStr !== "string") return null;
  const a = new Date(`${fromStr}T00:00:00`);
  const b = new Date(`${toStr}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
};

// ─── dailyWellbeing ──────────────────────────────────────────────────────────
// The daily series every recovery factor reads, oldest → newest.
//
// NEVER source these from calculateMetrics: its avgSleep/avgMood/avgSoreness
// are STRINGS (toFixed(1)), so `avg < 2.5` there is a string comparison that
// happens to work for one-digit values and silently stops working the moment a
// number crosses ten. This function returns numbers.
//
// Wellbeing is written as up to two docs a day (a morning doc carrying sleep, a
// night doc carrying mood/energy), so the docs are merged per date first —
// otherwise a morning-only day reads as "mood missing" and breaks a
// consecutive-day run that never actually broke. mood/soreness fall back to
// their AM/PM variants, the same normalisation athleteContextCore.js does.
//
// Scales, since two of the three run in opposite directions:
//   mood     1-5, higher is BETTER
//   soreness 1-5, higher is WORSE
//   sleep    HOURS (not a 1-5 score)
export function dailyWellbeing(entries, now = new Date()) {
  const ref = validDate(now);
  const todayStr  = toLocalDateStr(ref);
  const cutoffStr = toLocalDateStr(shiftDays(ref, -T.wellbeingWindowDays));

  const merged = mergeWellbeingByDate(
    arr(entries).filter(w => typeof w.date === "string" && w.date >= cutoffStr && w.date <= todayStr)
  );

  return Object.values(merged)
    .map(e => ({
      date:     e.date,
      mood:     num(e.mood     ?? e.moodAM     ?? e.moodPM),
      soreness: num(e.soreness ?? e.sorenessAM ?? e.sorenessPM),
      sleep:    num(e.sleep),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Non-null values of one field, oldest → newest.
const seriesOf = (days, field) => days.map(d => d[field]).filter(v => v != null);

// ─── seriesTrend ─────────────────────────────────────────────────────────────
// Older half vs newer half, with a noise floor scaled to the series' own
// spread. Ported from matchTrends.js:80-93 rather than reinvented, so there is
// one trend idiom in this codebase and not two that disagree at the edges.
//
// Difference from matchTrends: this returns a raw direction (rising/falling/
// flat) and leaves "is rising good or bad?" to the caller, because soreness
// rising and mood rising mean opposite things.
//
// Fewer than 4 points is not a trend — direction is null, and callers must
// treat null as "no signal", never as "flat".
export function seriesTrend(values, { noiseFloor = 0.1 } = {}) {
  const vals = (Array.isArray(values) ? values : []).map(num).filter(v => v != null);
  const base = { count: vals.length, older: null, newer: null, change: null, direction: null };
  if (vals.length < 4) return base;

  const split = Math.floor(vals.length / 2);
  const older = mean(vals.slice(0, split));
  const newer = mean(vals.slice(split));
  const change = +(newer - older).toFixed(2);

  // A threshold, not a sign test: self-reports move in halves, so scale to the
  // series' own spread and never fall below the caller's floor.
  const spread = Math.max(...vals) - Math.min(...vals);
  const noise = Math.max(spread * 0.1, noiseFloor);

  return {
    count: vals.length,
    older: +older.toFixed(2),
    newer: +newer.toFixed(2),
    change,
    direction: change > noise ? "rising" : change < -noise ? "falling" : "flat",
  };
}

// ─── the factor table ────────────────────────────────────────────────────────

const factor = ({ id, family, weight, counts = true, severe = false, standalone = false, label, evidence, metrics = {} }) =>
  ({ id, family, weight, counts, severe, standalone, label, evidence, metrics });

// Load factors — all three read the same weekLogs, and in practice the same
// week of training, which is why they collapse into one family.
function loadFactors(weekLogs, ref) {
  const out = [];
  const { acwr, weekSRPEs, thisWeekSRPE, fourWeekAvg } = computeLoad(weekLogs);
  const { monotony, strain } = computeMonotonyStrain(weekLogs, ref);

  // The monotony window is the 7 days ending at `ref`; computeMonotonyStrain
  // gives the ratio but not the volume it was computed over, so total it here.
  const sevenDayCutoff = toLocalDateStr(shiftDays(ref, -6));
  const todayStr = toLocalDateStr(ref);
  const sevenDaySRPE = weekLogs
    .filter(l => typeof l.date === "string" && l.date >= sevenDayCutoff && l.date <= todayStr)
    .reduce((sum, l) => sum + sessionSRPE(l), 0);

  const nonZeroWeeks = weekSRPEs.filter(s => s > 0).length;
  if (acwr != null && acwr >= T.acwrSpike && nonZeroWeeks >= T.acwrMinNonZeroWeeks) {
    const severe = acwr >= T.acwrSevere;
    out.push(factor({
      id: "acwr-spike", family: "load", weight: severe ? 3 : 2, severe,
      label: severe ? "Sharp jump in training load" : "Training load stepped up",
      evidence: `This week's load is ${Math.round(thisWeekSRPE)} against a 4-week average of ${Math.round(fourWeekAvg)} (ratio ${acwr}${severe ? ", danger zone" : ""}).`,
      metrics: { acwr, thisWeekSRPE: Math.round(thisWeekSRPE), fourWeekAvg: Math.round(fourWeekAvg) },
    }));
  }

  // weekSRPEs is [this week, 1 ago, 2 ago, 3 ago]. Strict `>`, matching
  // reminders.js rule 3c exactly.
  const recentWeeks = weekSRPEs.slice(0, T.sustainedWeeks);
  if (recentWeeks.length === T.sustainedWeeks && recentWeeks.every(s => s > T.sustainedWeekSRPE)) {
    out.push(factor({
      id: "sustained-load", family: "load", weight: 2,
      label: "Three heavy weeks back to back",
      evidence: `Weekly load has been over ${T.sustainedWeekSRPE} for ${T.sustainedWeeks} weeks running (${recentWeeks.map(Math.round).join(", ")}).`,
      metrics: { weekSRPEs: weekSRPEs.map(Math.round) },
    }));
  }

  if (monotony != null && monotony >= T.monotonyHigh && sevenDaySRPE >= T.monotonyMinWeekSRPE) {
    const severe = monotony >= T.monotonySevere;
    out.push(factor({
      id: "monotony-high", family: "load", weight: severe ? 2 : 1, severe,
      label: severe ? "Every session the same" : "Training is getting repetitive",
      evidence: `The last 7 days have almost no easy/hard variation (repetitiveness ${monotony}, ${Math.round(sevenDaySRPE)} total load).`,
      metrics: { monotony, strain, sevenDaySRPE: Math.round(sevenDaySRPE) },
    }));
  }

  return {
    factors: out,
    metrics: {
      acwr,
      thisWeekSRPE: Math.round(thisWeekSRPE),
      fourWeekAvg:  Math.round(fourWeekAvg),
      weekSRPEs:    weekSRPEs.map(Math.round),
      monotony,
      strain,
      sevenDaySRPE: Math.round(sevenDaySRPE),
    },
  };
}

// Recovery factors — everything here reads the merged daily series.
function recoveryFactors(days) {
  const out = [];

  const sorenessAll = seriesOf(days, "soreness");
  const sleepAll    = seriesOf(days, "sleep");

  const recentSoreness = sorenessAll.slice(-T.sorenessReadings);
  const sorenessMean = recentSoreness.length >= T.sorenessReadings ? round1(mean(recentSoreness)) : null;
  if (sorenessMean != null && sorenessMean >= T.sorenessHigh) {
    out.push(factor({
      id: "soreness-high", family: "recovery", weight: 2,
      label: "Sore for several days",
      evidence: `Soreness has averaged ${sorenessMean}/5 across the last ${T.sorenessReadings} check-ins.`,
      metrics: { sorenessMean },
    }));
  }

  const sorenessTrend = seriesTrend(sorenessAll.slice(-T.sorenessTrendReadings), { noiseFloor: T.sorenessNoiseFloor });
  if (sorenessTrend.direction === "rising" && sorenessTrend.newer >= T.sorenessRisingFloor) {
    out.push(factor({
      id: "soreness-rising", family: "recovery", weight: 2,
      label: "Soreness climbing week on week",
      evidence: `Soreness has moved from ${sorenessTrend.older}/5 to ${sorenessTrend.newer}/5 across the last ${sorenessTrend.count} check-ins.`,
      metrics: { sorenessTrend },
    }));
  }

  const recentSleep = sleepAll.slice(-T.sleepReadings);
  const sleepMean = recentSleep.length >= T.sleepReadings ? round1(mean(recentSleep)) : null;
  if (sleepMean != null && sleepMean <= T.sleepDeficitHours) {
    out.push(factor({
      id: "sleep-deficit", family: "recovery", weight: 2,
      label: "Not enough sleep",
      evidence: `Sleep has averaged ${sleepMean}h across the last ${T.sleepReadings} nights (${T.sleepDeficitHours}h+ is the target).`,
      metrics: { sleepMean },
    }));
  }

  // Consecutive *entries* in the daily series, matching athleteContextCore's
  // lowMoodFlag: a day with no check-in neither breaks nor extends the run,
  // because a missing day is missing data, not a good day.
  let streak = 0, maxStreak = 0, streakEnd = null;
  for (const d of days) {
    if (d.mood == null) continue;
    if (d.mood <= T.moodLow) { streak += 1; if (streak >= maxStreak) { maxStreak = streak; streakEnd = d.date; } }
    else streak = 0;
  }
  if (maxStreak >= T.moodLowDays) {
    out.push(factor({
      id: "mood-decline", family: "recovery", weight: 2,
      label: "Flat mood several days running",
      evidence: `Mood has been at or under ${T.moodLow}/5 for ${maxStreak} check-ins in a row (through ${streakEnd}).`,
      metrics: { moodLowStreak: maxStreak },
    }));
  }

  // Evidence only. Readiness is a weighted blend of the three signals already
  // scored above (load.js:134), so counting it would let one rough morning pay
  // for itself two or three times over. It rides along because it is the one
  // number the athlete herself sees on Home, and a parent reading the card
  // should see the same figure she does.
  const latest = [...days].reverse().find(d => d.mood != null && d.soreness != null) || null;
  const readiness = latest ? readinessScore(latest.mood, latest.soreness, latest.sleep ?? undefined) : null;
  if (readiness != null && readiness < T.readinessLow) {
    out.push(factor({
      id: "readiness-low", family: "recovery", weight: 0, counts: false,
      label: "Low readiness this morning",
      evidence: `Today's readiness score is ${readiness}/100 (${latest.date}).`,
      metrics: { readiness },
    }));
  }

  return {
    factors: out,
    metrics: {
      wellbeingDays: days.length,
      sorenessMean,
      sleepMean,
      moodLowStreak: maxStreak,
      readiness,
    },
  };
}

// Tissue factors — the body already telling someone something.
function tissueFactors(injuries, ref) {
  const out = [];
  const open = openInjuries(injuries);
  const maxSeverity = open.length ? Math.max(...open.map(i => num(i.severity) ?? 0)) : null;

  if (maxSeverity != null && maxSeverity >= T.injurySevere) {
    const worst = open[0];
    out.push(factor({
      // The one standalone factor. "Can barely train" / "can't train at all"
      // does not need corroboration from a second family to be worth a phone
      // buzz — waiting for one would be the engine's own gate arguing with the
      // athlete's own report.
      id: "open-injury-severe", family: "tissue", weight: 3, severe: true, standalone: true,
      label: "Open injury she can barely train through",
      evidence: `${describeInjury(worst)} — reported at severity ${maxSeverity}/5 and still open.`,
      metrics: { maxSeverity, openCount: open.length },
    }));
  } else if (maxSeverity === T.injuryModerate) {
    const worst = open[0];
    out.push(factor({
      id: "open-injury-moderate", family: "tissue", weight: 2,
      label: "Open injury changing how she moves",
      evidence: `${describeInjury(worst)} — severity ${maxSeverity}/5, so she is compensating to train.`,
      metrics: { maxSeverity, openCount: open.length },
    }));
  }

  const lingering = open
    .map(i => ({ injury: i, days: injuryDuration(i, ref) }))
    .filter(x => x.days != null && x.days >= T.injuryLingeringDays)
    .sort((a, b) => b.days - a.days)[0];
  if (lingering) {
    out.push(factor({
      id: "injury-lingering", family: "tissue", weight: 2,
      label: "Niggle that has not gone away",
      evidence: `${describeInjury(lingering.injury)} has been open for ${lingering.days} days.`,
      metrics: { lingeringDays: lingering.days },
    }));
  }

  // NOTE: recurringAreas reads new Date() internally and ignores `ref`.
  const recurring = recurringAreas(injuries, { withinDays: T.recurringWithinDays, minCount: T.recurringMinCount });
  if (recurring.length > 0) {
    const worst = recurring[0];
    out.push(factor({
      id: "recurring-area", family: "tissue", weight: 2,
      label: "Same spot keeps flaring up",
      evidence: `${worst.bodyArea} has been reported ${worst.count} times in the last ${T.recurringWithinDays} days (most recently ${worst.mostRecentOnset}).`,
      metrics: { recurringArea: worst.bodyArea, recurringCount: worst.count },
    }));
  }

  return {
    factors: out,
    metrics: {
      openInjuryCount: open.length,
      maxInjurySeverity: maxSeverity,
      lingeringDays: lingering?.days ?? null,
      recurringAreas: recurring.map(r => r.bodyArea),
    },
  };
}

// Growth factors — modifier family. These never fire alone; they make an
// otherwise borderline load or recovery story worth saying out loud, which is
// the only role the evidence actually supports.
function growthFactors(athlete, ref) {
  const out = [];
  const measurements = arr(athlete.measurements);

  // Measurements are stored newest-first by the app, but sort rather than
  // trust the order — this module also runs against server-side reads.
  const byDateDesc = [...measurements]
    .filter(m => typeof m.date === "string")
    .sort((a, b) => b.date.localeCompare(a.date));
  const latestSitting = byDateDesc.find(m => m.sittingHeight != null) || null;

  const maturity = latestSitting
    ? maturityOffset({
        dob:             athlete.dob,
        heightCm:        latestSitting.height ?? athlete.height,
        sittingHeightCm: latestSitting.sittingHeight ?? athlete.sittingHeight,
        weightKg:        latestSitting.weight ?? athlete.weight,
        date:            ref,
      })
    : null;

  if (maturity?.stage === "Mid-PHV") {
    out.push(factor({
      id: "mid-phv-window", family: "growth", weight: 2,
      label: "In the fastest part of her growth",
      // maturity.js's own words for this stage: "most sensitive period for
      // injury". Until now the app stated that on the Benchmarks tab and never
      // acted on it anywhere.
      evidence: `Maturity offset ${maturity.offset} years — she is inside the window where bone growth outpaces muscle length.`,
      metrics: { maturityStage: maturity.stage, maturityOffset: maturity.offset },
    }));
  }

  const velocity = growthVelocity(measurements);
  // growthVelocity uses the last two readings that carry a height; recompute
  // the span from the same pair, because it does not expose it and the span is
  // what decides whether the velocity is a measurement or noise.
  const heights = measurements
    .filter(m => m.height != null && typeof m.date === "string")
    .sort((a, b) => a.date.localeCompare(b.date));
  const spanDays = heights.length >= 2
    ? daysBetween(heights[heights.length - 2].date, heights[heights.length - 1].date)
    : null;

  if (velocity != null && velocity >= T.growthVelocityHigh && spanDays != null && spanDays >= T.growthMinSpanDays) {
    out.push(factor({
      id: "rapid-growth", family: "growth", weight: 2,
      label: "Growing fast right now",
      evidence: `She has grown at about ${velocity} cm/year over the last ${spanDays} days.`,
      metrics: { growthVelocity: velocity, growthSpanDays: spanDays },
    }));
  }

  return {
    factors: out,
    metrics: {
      maturityStage:  maturity?.stage ?? null,
      maturityOffset: maturity?.offset ?? null,
      growthVelocity: velocity,
      growthSpanDays: spanDays,
    },
  };
}

// ─── the gate ────────────────────────────────────────────────────────────────
// Exported so the rule can be unit-tested against factor combinations the live
// factor table cannot produce yet (two modifier families needs `asymmetry`,
// which is deferred).
//
// Rules, in order:
//   1. Any standalone factor fires, at `urgent`, whatever else is or is not on.
//   2. Otherwise: at least `minFamilies` counting families, at least one of
//      them a TRIGGER family, and totalWeight at least `minTotalWeight`.
//
// totalWeight sums each family's MAXIMUM factor weight, not every factor's
// weight. That is the structural fix for three-cards-one-story: an ACWR spike,
// a repetitive week and three heavy weeks are three readings of one week of
// training, so they contribute once, and the Guardian stays quiet exactly where
// the old engine shouted three times.
export function evaluateGate(factors) {
  const list = (Array.isArray(factors) ? factors : []).filter(isObj);
  const counting = list.filter(f => f.counts !== false);

  const byFamily = {};
  for (const f of counting) {
    const w = num(f.weight) ?? 0;
    byFamily[f.family] = Math.max(byFamily[f.family] ?? 0, w);
  }
  const families = Object.keys(byFamily).sort();
  const totalWeight = families.reduce((s, fam) => s + byFamily[fam], 0);

  const standalone = list.find(f => f.standalone === true) || null;
  const hasTrigger = families.some(fam => TRIGGER_FAMILIES.includes(fam));

  let fires, reason;
  if (standalone) {
    fires = true;
    reason = "standalone";
  } else if (families.length < T.minFamilies) {
    fires = false;
    reason = families.length === 0 ? "no-factors" : "single-family";
  } else if (!hasTrigger) {
    fires = false;
    reason = "modifiers-only";
  } else if (totalWeight < T.minTotalWeight) {
    fires = false;
    reason = "below-weight-floor";
  } else {
    fires = true;
    reason = "family-stack";
  }

  // A standalone factor is urgent by definition — it fired without needing a
  // second family to agree with it, so its weight is not comparable to a
  // stacked story's.
  const severity = !fires ? null
    : standalone ? "urgent"
    : totalWeight >= T.severityUrgent ? "urgent"
    : totalWeight >= T.severityConcern ? "concern"
    : "watch";

  return { fires, reason, families, totalWeight, severity, tone: toneFor(severity), weightByFamily: byFamily };
}

// Maps onto HomeScreen's existing ALERT_TONE(tone) so the Guardian card is
// styled by the same three words every other alert already uses.
function toneFor(severity) {
  if (severity === "urgent")  return "danger";
  if (severity === "concern") return "warn";
  if (severity === "watch")   return "info";
  return null;
}

const FAMILY_PHRASE = {
  load:      "training load",
  recovery:  "recovery",
  tissue:    "an ongoing injury",
  growth:    "a fast growth phase",
  asymmetry: "a left/right imbalance",
};

const joinPhrases = (families) => {
  const parts = families.map(f => FAMILY_PHRASE[f] ?? f);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

// One deterministic sentence the card can show before (or instead of) the LLM
// note. It names the families, never a diagnosis.
function guardianHeadline(families, factors, severity) {
  if (factors.some(f => f.standalone)) {
    return "An open injury needs clearing before the next session";
  }
  const sentence = `${joinPhrases(families)} are stacking up`;
  const headline = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return severity === "urgent" ? `${headline} — worth acting on today` : headline;
}

const slug = (key) => String(key).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

// storyKey is deliberately COARSE and not date-stamped: it names the families
// only. Cooldown keys on it, and keying on factors instead would let monotony
// ticking over 2.0 mint a fresh key and re-tell a story the parent read
// yesterday. factorKey is the fine-grained sibling, used for escalation
// diagnostics and never for suppression.
const storyKeyFor  = (families) => `g${GUARDIAN_ENGINE_VERSION}:${families.join("+")}`;
const factorKeyFor = (factors)  => `g${GUARDIAN_ENGINE_VERSION}:${factors.map(f => f.id).sort().join("+")}`;

// ─── assessGuardian ──────────────────────────────────────────────────────────
// The core. Pure, deterministic, and complete: it returns the full reasoning
// whether or not it fires, so a run that stayed silent can be read back from
// Firestore and understood without opening the logs.
//
//   raw = { athlete, weekLogs, wellbeing, injuries }
//   now = Date (see the real-clock caveat below)
//
// Real-clock caveat: computeLoad → getWeekBounds (dates.js) and recurringAreas
// (injuries.js) both read new Date() internally and ignore `now`. Everything
// else honours it. Callers running "as of" a date other than today will get
// load week buckets and the recurring-injury window anchored to the real today.
export function assessGuardian(raw, now = new Date()) {
  const ref      = validDate(now);
  const state    = isObj(raw) ? raw : {};
  const weekLogs  = arr(state.weekLogs);
  const wellbeing = arr(state.wellbeing);
  const injuries  = arr(state.injuries);
  const athlete   = isObj(state.athlete) ? state.athlete : {};
  const assessedAt = toLocalDateStr(ref);

  // Short-circuit before any factor runs. With neither training logs nor
  // check-ins there is nothing to reason across, and every factor would be
  // reading zeros — which is not the same as reading "fine".
  //
  // Injuries are deliberately exempt: an injury doc stands on its own without
  // any training or wellbeing context, and the athlete most likely to have gone
  // quiet on both is the one who is too hurt to train. Excluding them here would
  // silence the standalone severity-4+ override in precisely the case it exists
  // for. With logs and check-ins empty the load and recovery factors read null
  // and contribute nothing, so only the tissue and growth families can speak.
  if (weekLogs.length === 0 && wellbeing.length === 0 && injuries.length === 0) {
    return {
      fires: false, reason: "insufficient-data",
      severity: null, tone: null, totalWeight: 0,
      families: [], storyKey: null, factorKey: null, headline: null,
      factors: [], metrics: {}, actions: { athlete: [] },
      engineVersion: GUARDIAN_ENGINE_VERSION, assessedAt,
    };
  }

  const days = dailyWellbeing(wellbeing, ref);

  const load     = loadFactors(weekLogs, ref);
  const recovery = recoveryFactors(days);
  const tissue   = tissueFactors(injuries, ref);
  const growth   = growthFactors(athlete, ref);

  const factors = [...load.factors, ...recovery.factors, ...tissue.factors, ...growth.factors];
  const metrics = { ...load.metrics, ...recovery.metrics, ...tissue.metrics, ...growth.metrics };

  const gate = evaluateGate(factors);
  const families = gate.families;

  // Keys exist only for a firing assessment — a storyKey for a story nobody
  // told would be a cooldown entry for an alert that was never sent.
  const storyKey  = gate.fires ? storyKeyFor(families) : null;
  const factorKey = gate.fires ? factorKeyFor(factors.filter(f => f.counts !== false)) : null;

  return {
    fires: gate.fires,
    reason: gate.reason,
    severity: gate.severity,
    tone: gate.tone,
    totalWeight: gate.totalWeight,
    families,
    storyKey,
    factorKey,
    headline: gate.fires ? guardianHeadline(families, factors, gate.severity) : null,
    factors,
    metrics,
    actions: { athlete: gate.fires ? athleteActions(families, factors) : [] },
    engineVersion: GUARDIAN_ENGINE_VERSION,
    assessedAt,
  };
}

// ─── cooldownDecision ────────────────────────────────────────────────────────
// The anti-repeat mechanism. Given the stored cooldown doc and today's
// assessment, decide whether this story is allowed to speak.
//
//   cooldowns — athletes/{id}/guardianState/cooldowns, shape { stories: { [storyKey]: entry } }
//   returns   — { suppressed, reason, nextEntry }
//
// `nextEntry` is the cooldown entry to merge-write when the alert goes out, and
// is null whenever nothing is sent — so the caller never has to decide.
//
// Escalation breaks the window when the story got materially worse: severity
// rose, a NEW family joined, or weight jumped by escalationWeightJump. Adding a
// factor *inside* an already-firing family does not break it — that is the same
// story with more evidence, and the parent already has the point.
const SEVERITY_RANK = { watch: 1, concern: 2, urgent: 3 };

export function cooldownDecision(cooldowns, assessment, now = new Date()) {
  const ref = validDate(now);
  const todayStr = toLocalDateStr(ref);
  const a = isObj(assessment) ? assessment : {};

  if (!a.fires || !a.storyKey) {
    return { suppressed: true, reason: "not-firing", nextEntry: null };
  }

  const stories = isObj(cooldowns) && isObj(cooldowns.stories) ? cooldowns.stories : {};
  const prior = isObj(stories[a.storyKey]) ? stories[a.storyKey] : null;

  const entryFor = (reason) => ({
    storyKey: a.storyKey,
    factorKey: a.factorKey ?? null,
    families: [...(a.families || [])],
    severity: a.severity ?? null,
    totalWeight: a.totalWeight ?? 0,
    // The date THIS alert episode started. Suppression means no new doc, so
    // this only moves when an alert is actually written — which is exactly
    // what makes buildGuardianAlert's alertId stable across a same-day re-run.
    firstFiredDate: todayStr,
    lastFiredDate: todayStr,
    // First time this story ever spoke, kept across episodes purely so a human
    // reading the doc can see how long it has been recurring.
    firstSeenDate: prior?.firstSeenDate ?? todayStr,
    fireCount: (num(prior?.fireCount) ?? 0) + 1,
    reason,
  });

  if (!prior) return { suppressed: false, reason: "first-fire", nextEntry: entryFor("first-fire") };

  const elapsed = daysBetween(prior.lastFiredDate, todayStr);
  if (elapsed == null || elapsed >= T.cooldownDays || elapsed < 0) {
    return { suppressed: false, reason: "cooldown-expired", nextEntry: entryFor("cooldown-expired") };
  }

  const priorRank = SEVERITY_RANK[prior.severity] ?? 0;
  const nowRank   = SEVERITY_RANK[a.severity] ?? 0;
  const priorFamilies = new Set(Array.isArray(prior.families) ? prior.families : []);
  const newFamily = (a.families || []).some(f => !priorFamilies.has(f));
  const weightJump = (num(a.totalWeight) ?? 0) - (num(prior.totalWeight) ?? 0);

  if (nowRank > priorRank)                          return { suppressed: false, reason: "escalation-severity", nextEntry: entryFor("escalation-severity") };
  if (newFamily)                                    return { suppressed: false, reason: "escalation-new-family", nextEntry: entryFor("escalation-new-family") };
  if (weightJump >= T.escalationWeightJump)          return { suppressed: false, reason: "escalation-weight", nextEntry: entryFor("escalation-weight") };

  return { suppressed: true, reason: "cooldown", nextEntry: null };
}

// ─── athleteActions ──────────────────────────────────────────────────────────
// The deterministic safety net behind the athlete's card.
//
// Two guarantees, and both matter more than the prose quality: the card is
// never blank when the LLM call fails, and it is *structurally impossible* for
// it to show her risk framing — the only risk language in the whole alert lives
// in parentNote and factors[].evidence, neither of which her view renders.
//
// Returns a non-empty array of plain, doable actions for every family
// combination the gate can produce.
export function athleteActions(families, factors) {
  const fams = (Array.isArray(families) ? families : []).filter(f => typeof f === "string");
  const list = (Array.isArray(factors) ? factors : []).filter(isObj);
  const has = (id) => list.some(f => f.id === id);
  const out = [];

  if (fams.includes("load")) {
    out.push(has("monotony-high")
      ? "Mix today up — something that feels different from the last few sessions."
      : "Keep today shorter than usual and finish while you still feel fresh.");
  }
  if (fams.includes("recovery")) {
    out.push(has("sleep-deficit")
      ? "Aim to be in bed 30 minutes earlier tonight, screens off."
      : "Take an easy 10 minutes to stretch and drink plenty of water today.");
  }
  if (fams.includes("tissue")) {
    out.push("Tell your coach which spot is bothering you before you warm up.");
  }
  if (fams.includes("growth")) {
    out.push("Add a few extra minutes of mobility work before you go on court.");
  }
  if (fams.includes("asymmetry")) {
    out.push("Give your weaker side a couple of extra reps in the warm-up.");
  }

  // Never return nothing. An unknown or empty family list still gets a real
  // action, because a blank card is worse than a generic one.
  if (out.length === 0) {
    out.push("Check in with your coach about how today's session should feel.");
  }
  return out;
}

// ─── buildGuardianNotesPrompt ────────────────────────────────────────────────
// Pure. The single LLM call, made only after the gate AND the cooldown have
// both said yes. Extends digestCore.js's system shell so the Guardian reads
// like the rest of the app rather than a second voice.
const GUARDIAN_NOTES_MAX_TOKENS = 600;

export function buildGuardianNotesPrompt(assessment, athleteName) {
  const a = isObj(assessment) ? assessment : {};
  const name = athleteName || "Valissa";

  const system =
    "You are an expert youth tennis coach writing the short note a parent reads at 6am, before training. " +
    "The factors below were produced by a deterministic risk engine that has ALREADY decided there is a problem. " +
    "You are writing two sentences, not re-deciding whether there is a problem. " +
    "Never contradict a factor, never soften one, never add one that is not listed. " +
    "Never name an injury, a diagnosis or a probability. " +
    "Work only from the factors given — never invent an event, a result or a statistic that is not below. " +
    "Return ONLY a raw JSON object. Do NOT wrap in markdown code fences. Do NOT include ```json or ``` anywhere in your response. Start your response with { and end with }.";

  const factorLines = (a.factors || [])
    .filter(f => isObj(f))
    .map(f => `- [${f.family}] ${f.label}: ${f.evidence}`)
    .join("\n") || "- None recorded.";

  const actionLines = (a.actions?.athlete || []).map(x => `- ${x}`).join("\n") || "- None recorded.";

  const prompt = `RISK ASSESSMENT for ${name} — ${a.assessedAt || "today"}

SEVERITY: ${a.severity || "—"} (combined weight ${a.totalWeight ?? "—"})
SIGNAL FAMILIES THAT STACKED: ${(a.families || []).join(", ") || "—"}
DETERMINISTIC HEADLINE: ${a.headline || "—"}

FACTORS THE ENGINE FOUND:
${factorLines}

ACTIONS ALREADY PREPARED FOR THE ATHLETE (do not contradict these):
${actionLines}

Respond with exactly this JSON structure:
{
  "parentNote": "2-4 candid sentences for the parent. Say why THESE signals matter together — the combination is the point, not any single one. End with the one concrete change to make today. Plain language, no jargon: never use the words sRPE, ACWR, monotony, strain or PHV — describe what they mean instead. Do not name an injury, a diagnosis or a probability.",
  "athleteNote": "1-2 warm sentences written TO ${name}, who is 12. Give exactly ONE concrete thing to do today. No numbers. Never use these words: injury, hurt, risk, growth spurt, fragile, worry."
}`;

  return { system, prompt, maxTokens: GUARDIAN_NOTES_MAX_TOKENS };
}

// ─── buildGuardianAlert ──────────────────────────────────────────────────────
// The Firestore artifact: athletes/{id}/guardianAlerts/{alertId}.
//
// alertId is `{firstFiredDate}_{storyKeySlug}` — DATE FIRST, so
// orderBy(documentId(), 'desc') is chronological and the card reads the newest
// alert in a single doc read (the same trick WeeklyDigestCard already uses).
// Deterministic, so a same-day re-run is an idempotent overwrite rather than a
// duplicate card.
//
// Returns null when the assessment did not fire — there is no such thing as an
// alert doc for a quiet day.
export function buildGuardianAlert({ assessment, notes = null, now = new Date(), generatedBy = "guardian", athleteName = null } = {}) {
  const a = isObj(assessment) ? assessment : null;
  if (!a || !a.fires || !a.storyKey) return null;

  const ref = validDate(now);
  const firstFiredDate = toLocalDateStr(ref);
  const n = isObj(notes) ? notes : {};

  return {
    alertId: `${firstFiredDate}_${slug(a.storyKey)}`,
    engineVersion: GUARDIAN_ENGINE_VERSION,

    // identity
    storyKey:  a.storyKey,
    factorKey: a.factorKey ?? null,
    families:  [...(a.families || [])],

    // when
    firstFiredDate,
    assessedAt:  a.assessedAt ?? firstFiredDate,
    generatedAt: ref.toISOString(),
    generatedBy,
    athleteName,

    // the deterministic assessment
    severity:    a.severity ?? null,
    tone:        a.tone ?? null,
    totalWeight: a.totalWeight ?? 0,
    headline:    a.headline ?? null,
    factors: (a.factors || []).filter(isObj).map(f => ({
      id: f.id, family: f.family, weight: f.weight, counts: f.counts !== false,
      severe: !!f.severe, standalone: !!f.standalone,
      label: f.label, evidence: f.evidence, metrics: f.metrics ?? {},
    })),
    metrics: a.metrics ?? {},
    actions: { athlete: [...(a.actions?.athlete || [])] },

    // the optional LLM layer — the alert is complete and useful without it
    parentNote:  typeof n.parentNote  === "string" ? n.parentNote  : null,
    athleteNote: typeof n.athleteNote === "string" ? n.athleteNote : null,
    notesError:  n.error ?? null,

    // delivery + lifecycle
    // Parents only, and only above `watch`: a 6am buzz IS risk framing however
    // it is worded, and sendCheckinReminder already owns the athlete's one
    // gentle push. Her note reaches her in-app, on Home, before training.
    push: { eligible: a.severity !== "watch", role: "parent", sentAt: null },
    dismissedAt: null,
    dismissedBy: null,
    resolvedAt: null,
  };
}

// ─── guardianPushPayload ─────────────────────────────────────────────────────
// Pure. `tag: 'guardian'` so a second Guardian push replaces the first in the
// tray instead of stacking — this is one ongoing story, not a feed.
export function guardianPushPayload(alert) {
  const a = isObj(alert) ? alert : {};
  const name = a.athleteName || "Valissa";
  const title = a.severity === "urgent" ? `${name} — worth a look before training` : `Heads up on ${name}`;

  const note = typeof a.parentNote === "string" ? a.parentNote.trim() : "";
  if (note) {
    const firstSentence = note.match(/^[\s\S]*?[.!?](?=\s|$)/);
    return { title, body: (firstSentence ? firstSentence[0] : note).trim(), tag: "guardian" };
  }
  return { title, body: a.headline || "Several training signals are stacking up today.", tag: "guardian" };
}

// ─── supersededReminderKinds ─────────────────────────────────────────────────
// Which reminder `kind`s the Guardian's story already covers, so MobileApp can
// pass them to dueReminders(state, today, { suppressKinds }) and the parent
// reads one card instead of a card plus the two reminders that say the same
// thing in less detail.
//
// Mapped against the reminder kinds that exist TODAY (reminders.js): the
// monotony and high-load rules were already collapsed into the single `load`
// kind, and the standalone `injury` alert was deleted outright — HomeScreen's
// own injury Card is strictly richer — which is why `tissue` supersedes
// nothing. Never suppress `checkin`, `tournament` or the priority/technical
// kinds: those are logistics, and the Guardian says nothing about them.
const FAMILY_SUPERSEDES = Object.freeze({
  load:     ["load"],
  recovery: ["mood", "sleep"],
  tissue:   [],
});

export function supersededReminderKinds(alert) {
  const a = isObj(alert) ? alert : null;
  if (!a) return [];
  if (a.dismissedAt || a.resolvedAt) return [];
  if (a.engineVersion != null && a.engineVersion !== GUARDIAN_ENGINE_VERSION) return [];

  const out = [];
  for (const fam of Array.isArray(a.families) ? a.families : []) {
    for (const kind of FAMILY_SUPERSEDES[fam] || []) {
      if (!out.includes(kind)) out.push(kind);
    }
  }
  return out;
}
