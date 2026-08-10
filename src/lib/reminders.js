import { computeLoad, acwrStatus, computeMonotonyStrain, monotonyStatus, calculateMetrics } from "./load.js";
import { daysUntil, nearestUpcoming } from "./tournaments.js";
import { injuryLoadFlag } from "./injuries.js";
import { weeklyFocus } from "./practiceFocus.js";
import { toLocalDateStr } from "./dates.js";
import { FITNESS_TESTS } from "./fitnessTests.js";
import RULES from "./reminderRules.json";

// ─── UNIFIED REMINDER / ALERT ENGINE ─────────────────────────────────────────
// The single source of truth for "what needs attention", replacing the two
// engines that used to drift (MobileApp.jsx's inline block and
// AlertsBanner.jsx's own Firestore-querying checks). Pure and Firebase-free —
// this module must never import src/firebase.js or deferredPriorities.js
// (that one does Firestore I/O); callers pass already-loaded data in `state`.
// The Firebase-free guarantee is enforced repo-wide by the transitive import
// guard in athleteMemoryCore.test.js, same convention as priorityMetrics.js.
//
// `reminderRules.json` documentation (JSON has no comment syntax, so it lives
// here instead):
//   fitnessRetestDays   — a fitness test is overdue once this many days have
//                          passed since it was last logged, PER TEST (not a
//                          single global "last benchmark" date — a per-test
//                          reading is strictly more useful, since one fresh
//                          test shouldn't hide eleven stale ones).
//   strokeReviewDays     — the default follow-up window StrokeSheet/
//                          TechnicalTab schedule when a review is requested
//                          (used here only for documentation/consistency; the
//                          actual due check reads the stored reviewDueDate).
//   tournamentWindowDays — how many days out a tournament starts surfacing.
//                          Chosen as 14 (MobileApp's number, not AlertsBanner's
//                          7) because the plan generator's taper logic
//                          (tournamentModeFor) already starts adjusting at 13
//                          days out ("pre") — a 14-day reminder window lines up
//                          with the day taper behavior actually begins,
//                          instead of only warning once she's already in it.
//   highLoadSRPE/highLoadWeeks — extended-high-load fires when sRPE exceeds
//                          highLoadSRPE for highLoadWeeks consecutive weeks.
//   escalationWeeks      — documentation only; the actual escalation flag
//                          lives on the priority doc's `status` field, set by
//                          deferredPriorities.js's checkEscalations using this
//                          same threshold.
//   moodDeclineThreshold/moodDeclineDays — mood check fires when the recent
//                          average mood (over calculateMetrics' 7-day window)
//                          is below the threshold and at least moodDeclineDays
//                          of check-ins are on record. This is a looser signal
//                          than AlertsBanner's original "N consecutive days
//                          below threshold" scan — calculateMetrics only
//                          exposes a 7-day average, not the raw daily
//                          sequence, so consecutive-run detection was dropped
//                          in favor of reusing the shared metrics function
//                          both engines already trust.
//   sleepDeficitHours/sleepDeficitDays — same shape, for sleep.
//   technicalReviewCap   — MobileApp capped displayed review reminders at 2 so
//                          the home screen doesn't flood with review nags;
//                          kept here so both engines behave identically.
//
// `dueReminders(state, today)` → array of { id, kind, tone, title, body,
// audience }, sorted most-urgent-first (tone: danger > warn > info, then
// check order) and deduped by id. `today` is a Date. Never throws — malformed
// or empty `state` yields [].
export function dueReminders(state, today) {
  if (!state || typeof state !== "object") return [];
  const now = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date();
  const todayStr = toLocalDateStr(now);

  const weekLogs    = Array.isArray(state.weekLogs)    ? state.weekLogs    : [];
  const wellbeing    = Array.isArray(state.wellbeing)    ? state.wellbeing    : [];
  const tournaments = Array.isArray(state.tournaments) ? state.tournaments : [];
  const priorities  = Array.isArray(state.priorities)  ? state.priorities  : [];
  const technical   = Array.isArray(state.technical)   ? state.technical   : [];
  const benchmarks  = Array.isArray(state.benchmarks)  ? state.benchmarks  : [];
  const injuries    = Array.isArray(state.injuries)    ? state.injuries    : [];
  const plan        = state.plan && typeof state.plan === "object" ? state.plan : null;

  const reminders = [];
  const push = (r) => reminders.push(r);

  // 1. No check-in today (NEW). "Checked in" is ambiguous: CheckinSheet writes
  // one {type:"checkin"} doc/day, legacy AVWellbeing writes separate
  // {type:"morning"} and {type:"night"} docs, and mergeWellbeingByDate counts
  // ANY doc as the day being present. A morning-only entry is deliberately NOT
  // enough here — this is an end-of-day nudge, so only a doc that actually
  // closes the day out ("checkin" or "night") satisfies it.
  const checkedInToday = wellbeing.some(w => w && w.date === todayStr && ["checkin", "night"].includes(w.type));
  if (!checkedInToday) {
    push({
      id: `checkin-missing-${todayStr}`, kind: "checkin", tone: "info",
      title: "No check-in today", body: "Log how today felt before you finish up.",
      audience: "athlete",
    });
  }

  // 2. Stale / generated-but-unlogged plan (NEW). Nag once a plan exists,
  // wasn't generated today (give her the rest of the day it was made before
  // nagging), and its session hasn't been logged yet.
  if (plan?.generatedAt && !plan.sessionLogged) {
    const generatedDate = new Date(plan.generatedAt);
    if (!Number.isNaN(generatedDate.getTime()) && toLocalDateStr(generatedDate) !== todayStr) {
      push({
        id: `plan-unlogged-${toLocalDateStr(generatedDate)}`, kind: "plan-stale", tone: "info",
        title: "Plan session not logged yet",
        body: "This week's plan was generated but the session hasn't been logged.",
        audience: "both",
      });
    }
  }

  // 3. Training load high + high monotony.
  const { acwr, weekSRPEs } = computeLoad(weekLogs);
  const loadSt = acwrStatus(acwr);
  if (loadSt && (loadSt.tone === "danger" || loadSt.tone === "warn")) {
    push({
      id: `load-${loadSt.tone}-${todayStr}`, kind: "load", tone: loadSt.tone,
      title: "Training load is high",
      body: loadSt.tone === "danger" ? "ACWR is in the danger zone — make today a recovery day." : "Ease off intensity for a day or two.",
      audience: "parent",
    });
  }
  const { monotony } = computeMonotonyStrain(weekLogs, now);
  const monoSt = monotonyStatus(monotony);
  if (monoSt && (monoSt.tone === "danger" || monoSt.tone === "warn")) {
    push({
      id: `monotony-${monoSt.tone}-${todayStr}`, kind: "monotony", tone: monoSt.tone,
      title: monoSt.label, body: "Training is repetitive this week — vary intensity across sessions.",
      audience: "parent",
    });
  }

  // 4. Extended high load — sRPE > highLoadSRPE for highLoadWeeks consecutive
  // weeks. weekSRPEs is [thisWeek, 1wk ago, 2wk ago, 3wk ago].
  const highWeeks = weekSRPEs.slice(0, RULES.highLoadWeeks);
  if (highWeeks.length === RULES.highLoadWeeks && highWeeks.every(s => s > RULES.highLoadSRPE)) {
    push({
      id: `high-load-${RULES.highLoadWeeks}wk-${todayStr}`, kind: "high-load", tone: "warn",
      title: "Extended high training load",
      body: `sRPE has exceeded ${RULES.highLoadSRPE} for ${RULES.highLoadWeeks} consecutive weeks. Consider a deload week.`,
      audience: "parent",
    });
  }

  // 5. Mood decline / sleep deficit (see header comment for the fidelity note).
  const metrics = calculateMetrics(weekLogs, wellbeing, now);
  if (metrics.avgMood != null && metrics.wellbeingDays >= RULES.moodDeclineDays && Number(metrics.avgMood) < RULES.moodDeclineThreshold) {
    push({
      id: `mood-decline-${todayStr}`, kind: "mood", tone: "warn",
      title: "Mood decline",
      body: `Average mood is ${metrics.avgMood}/5 over the last ${metrics.wellbeingDays} days. Check in with your athlete.`,
      audience: "parent",
    });
  }
  if (metrics.avgSleep != null && metrics.wellbeingDays >= RULES.sleepDeficitDays && Number(metrics.avgSleep) < RULES.sleepDeficitHours) {
    push({
      id: `sleep-deficit-${todayStr}`, kind: "sleep", tone: "warn",
      title: "Sleep deficit",
      body: `Average sleep is ${metrics.avgSleep}h over the last ${metrics.wellbeingDays} days (recommended: ${RULES.sleepDeficitHours}+).`,
      audience: "parent",
    });
  }

  // 6. Tournament approaching — window chosen as tournamentWindowDays (see
  // header comment). Relevant to both the athlete (she plays it) and parents
  // (they plan around it), so audience is "both".
  const nearestT = nearestUpcoming(tournaments, todayStr);
  if (nearestT) {
    const d = daysUntil(nearestT.date, todayStr);
    if (d <= RULES.tournamentWindowDays) {
      push({
        id: `tourney-${nearestT.id ?? nearestT.date}-${d <= 7 ? "wk" : "2wk"}`, kind: "tournament", tone: "info",
        title: d === 0 ? "Tournament today! 🏟️" : `Tournament in ${d} day${d === 1 ? "" : "s"}`,
        body: `${nearestT.name || "Tournament"} — Sunday plans taper automatically.`,
        audience: "both",
      });
    }
  }

  // 7. Escalated priorities. `priorities` is already-loaded plain data — never
  // call deferredPriorities.js from here.
  priorities.filter(p => p && p.status === "escalated").forEach(p => push({
    id: `esc-${p.id}`, kind: "priority-escalated", tone: "danger",
    title: "Priority needs attention",
    body: `"${p.priority}" has been waiting ${p.weeksDeferredCount ?? "several"} weeks.`,
    audience: "parent",
  }));

  // 7b. Weekly practice focus (NEW-ish — surfaces the same pick weeklyFocus
  // already makes for the on-court focus loop, so it isn't reimplemented).
  // Athlete-facing: it's the thing she does on court, not a medical/coach flag.
  const focus = weeklyFocus(priorities);
  if (focus) {
    push({
      id: `focus-${focus.id}`, kind: "practice-focus", tone: "info",
      title: "This week's on-court focus",
      body: `Work on: ${focus.priority}`,
      audience: "athlete",
    });
  }

  // 8. Technical review due — latest entry per strokeArea, status "active"
  // only (a resolved/"reviewed" entry must stop nagging), capped so the list
  // can't flood.
  const latestByArea = {};
  for (const t of technical) {
    if (!t || !t.strokeArea) continue;
    const cur = latestByArea[t.strokeArea];
    if (!cur || (t.date || "") > (cur.date || "")) latestByArea[t.strokeArea] = t;
  }
  Object.values(latestByArea)
    .filter(t => t.status === "active" && t.reviewDueDate && t.reviewDueDate <= todayStr)
    .sort((a, b) => (a.reviewDueDate || "").localeCompare(b.reviewDueDate || ""))
    .slice(0, RULES.technicalReviewCap)
    .forEach(t => push({
      id: `rev-${t.id}`, kind: "technical-review", tone: "info",
      title: `🎥 Review due: ${t.strokeArea}`,
      body: `Scheduled stroke review reached (${t.reviewDueDate}).`,
      audience: "parent",
    }));

  // 9. Fitness retest overdue — per test (not a single global "latest of
  // anything" date), using FITNESS_TESTS as the canonical test list.
  const retestCutoff = new Date(now);
  retestCutoff.setDate(retestCutoff.getDate() - RULES.fitnessRetestDays);
  const retestCutoffStr = toLocalDateStr(retestCutoff);
  const byTest = {};
  for (const b of benchmarks) {
    if (!b || !b.testName) continue;
    if (!byTest[b.testName]) byTest[b.testName] = [];
    byTest[b.testName].push(b);
  }
  const overdueTests = FITNESS_TESTS.filter(test => {
    const entries = byTest[test.name];
    if (!entries || entries.length === 0) return true;
    const latestDate = entries.reduce((max, e) => (e.date > max ? e.date : max), entries[0].date || "");
    return latestDate < retestCutoffStr;
  });
  if (overdueTests.length > 0) {
    push({
      id: `fitness-retest-${todayStr}`, kind: "fitness-retest", tone: "info",
      title: "Fitness retest overdue",
      body: overdueTests.length === 1
        ? `${overdueTests[0].name} hasn't been retested in ${RULES.fitnessRetestDays}+ days.`
        : `${overdueTests.length} fitness tests haven't been retested in ${RULES.fitnessRetestDays}+ days.`,
      audience: "parent",
    });
  }

  // 10. Open injury.
  const injFlag = injuryLoadFlag(injuries);
  if (injFlag) {
    push({
      id: `injury-${injFlag.tone}-${todayStr}`, kind: "injury", tone: injFlag.tone,
      title: "🩹 " + injFlag.headline, body: injFlag.guidance,
      audience: "parent",
    });
  }

  // Dedupe by id, then sort most-urgent-first: tone rank primary, original
  // (check-declaration) order as a stable secondary key.
  const seen = new Set();
  const deduped = reminders.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  const toneRank = { danger: 0, warn: 1, info: 2 };
  return deduped
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (toneRank[a.r.tone] ?? 9) - (toneRank[b.r.tone] ?? 9) || a.i - b.i)
    .map(({ r }) => r);
}
