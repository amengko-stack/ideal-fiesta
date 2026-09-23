import { sessionSRPE, computeLoad } from "./load.js";
import { toLocalDateStr } from "./dates.js";
import { nearestUpcoming, daysUntil } from "./tournaments.js";
import { computeAge, identityBlock, resolveIdentity } from "./athleteIdentity.js";
import { memoryBlock } from "./athleteMemoryCore.js";
import { openInjuries, injuryLoadFlag, injuryDuration, recurringAreas } from "./injuries.js";

// ─── ATHLETE CONTEXT — PURE CORE ─────────────────────────────────────────────
// The 11-section context assembly, moved verbatim out of athleteContext.js and
// parameterised on plain objects plus `now`. No Firestore import: the client
// wrapper (athleteContext.js) runs the client-SDK queries and the Cloud
// Function adapter runs the admin-SDK ones, and both hand the same raw bundle
// to this function so the two can never drift on what the AI is told.
//
// ── raw bundle ───────────────────────────────────────────────────────────────
// Every field is optional; a missing/null field degrades to the same default the
// original try/catch produced.
//
//   athleteUid            string
//   weekLogs              [{ id, date, type, duration, rpe|intensity, ... }]  ALL logs; cut to 28d here
//   wellbeing             [{ id, date, sleep, mood|moodAM|moodPM, soreness|..., ... }]  newest-first, ≤14; cut to 7d here
//   tournaments           [{ id, date, ... }] | null   (null = the read failed → defaults stand)
//   tournamentStatusDoc   legacy athletes/{id}/config/tournamentStatus data | null
//   lastStrengthSession   the newest sessions/* doc data | null
//   profile               athletes/{id} doc data | null
//   matches               [{ id, athleteId, matchStartTime, ... }]  ALL matches; filtered here
//   matchAnalysisDoc      matchAnalyses/{recentMatchId} data | null
//   deferredDocs          [{ id, status, priority, ... }]  ALL deferred priorities; filtered here
//   technicalAssessments  [{ date, priority, ... }] | null   (≤30, newest-first)
//   memoryDoc             memory/current data | null
//   seasonReportDoc       reports/seasonLatest data | null
//   injuries              [{ id, status, bodyArea, severity, ... }] | null

// ── selectRecentMatch ────────────────────────────────────────────────────────
// Pure. The athlete's most recent match within the last 14 days, or null. Split
// out because the wrapper needs the match id to know which matchAnalyses doc to
// fetch before it can call assembleAthleteContext.
export function selectRecentMatch(matches, athleteUid, now = new Date()) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const cutoff14 = toLocalDateStr(new Date(now - 14 * msPerDay));
  return (matches || [])
    .filter(m => m.athleteId === athleteUid && (m.matchStartTime ?? "") >= cutoff14)
    .sort((a, b) => (b.matchStartTime ?? "").localeCompare(a.matchStartTime ?? ""))[0] ?? null;
}

export function assembleAthleteContext(raw, now = new Date()) {
  const {
    athleteUid,
    weekLogs = [],
    wellbeing: wellbeingDocs = [],
    tournaments = null,
    tournamentStatusDoc = null,
    lastStrengthSession: lastSessionDoc = null,
    profile = null,
    matches = [],
    matchAnalysisDoc = null,
    deferredDocs = [],
    technicalAssessments: technicalAssessmentDocs = null,
    memoryDoc = null,
    seasonReportDoc = null,
    injuries: injuryDocs = null,
  } = raw || {};

  const msPerDay  = 24 * 60 * 60 * 1000;
  const cutoff28  = toLocalDateStr(new Date(now - 28 * msPerDay));
  const cutoff7   = toLocalDateStr(new Date(now - 7  * msPerDay));

  // ── 1. Session logs (weekLogs) — last 28 days ──────────────────────────────
  const allLogs = (weekLogs || []).filter(l => l.date >= cutoff28);

  // Use the SAME sRPE definition the dashboard uses (sessionSRPE) so the AI and
  // the parent view never diverge on load/ACWR.
  const logsWithSrpe = allLogs.map(l => ({ ...l, srpe: sessionSRPE(l) }));

  // Shared acute:chronic computation — identical numbers to calculateMetrics.
  const { thisWeekSRPE, fourWeekAvg, acwr } = computeLoad(allLogs);

  const sessionLogs = {
    sessions:        logsWithSrpe,
    thisWeekSrpe:    Math.round(thisWeekSRPE),
    fourWeekAvgSrpe: Math.round(fourWeekAvg),
    acwr,
  };

  // ── 2. Wellbeing — last 7 days ─────────────────────────────────────────────
  const wellEntries = (wellbeingDocs || []).filter(w => w.date >= cutoff7);

  const numAvg = vals => vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;

  const sleepVals    = wellEntries.map(e => e.sleep).filter(v => v != null);
  // Wellbeing entries store mood/soreness as mood or moodAM/moodPM depending on type
  const moodVals     = wellEntries.map(e => e.mood ?? e.moodAM ?? e.moodPM).filter(v => v != null);
  const sorenessVals = wellEntries.map(e => e.soreness ?? e.sorenessAM ?? e.sorenessPM).filter(v => v != null);

  // Consecutive low-mood check (sort asc so days are in order)
  const sortedWell = [...wellEntries].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0, maxStreak = 0;
  for (const e of sortedWell) {
    const m = e.mood ?? e.moodAM ?? e.moodPM;
    if (m != null && m < 2.5) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else if (m != null)        { streak = 0; }
  }

  const wellbeing = {
    entries:        wellEntries,
    avgSleepHours:  numAvg(sleepVals),
    avgMood:        numAvg(moodVals),
    avgSoreness:    numAvg(sorenessVals),
    lowMoodFlag:    maxStreak >= 3,
    lowSleepFlag:   sleepVals.filter(s => s < 7).length >= 5,
  };

  // ── 3. Tournament status ───────────────────────────────────────────────────
  let tournamentStatus = {
    hasUpcomingTournament:   false,
    daysUntilTournament:     null,
    playedTournamentRecently: false,
    daysSinceTournament:     null,
  };
  try {
    const todayStr = toLocalDateStr(now);

    if (tournaments && tournaments.length > 0) {
      const upcoming = nearestUpcoming(tournaments, todayStr);
      const past = tournaments
        .filter(t => t.date && daysUntil(t.date, todayStr) < 0)
        .sort((a, b) => b.date.localeCompare(a.date))[0] || null;

      const daysUntilVal = upcoming ? daysUntil(upcoming.date, todayStr) : null;
      const daysSinceVal = past ? -daysUntil(past.date, todayStr) : null;

      tournamentStatus = {
        hasUpcomingTournament:    daysUntilVal != null,
        daysUntilTournament:      daysUntilVal,
        playedTournamentRecently: daysSinceVal != null && daysSinceVal <= 14,
        daysSinceTournament:      daysSinceVal,
      };
    } else if (tournaments && tournamentStatusDoc) {
      // Legacy fallback — no code writes this doc anymore, kept only for
      // any pre-existing accounts that still have one.
      const t        = tournamentStatusDoc;
      const daysUntilVal = t.upcomingTournamentDate
        ? Math.round((new Date(t.upcomingTournamentDate) - now) / msPerDay)
        : null;
      const daysSinceVal = t.lastTournamentDate
        ? Math.round((now - new Date(t.lastTournamentDate)) / msPerDay)
        : null;
      tournamentStatus = {
        hasUpcomingTournament:    daysUntilVal != null && daysUntilVal >= 0,
        daysUntilTournament:      daysUntilVal != null && daysUntilVal >= 0 ? daysUntilVal : null,
        playedTournamentRecently: daysSinceVal != null && daysSinceVal <= 14,
        daysSinceTournament:      daysSinceVal,
      };
    }
  } catch { /* malformed data — defaults stand */ }

  // ── 4. Last strength session ───────────────────────────────────────────────
  let lastStrengthSession = null;
  if (lastSessionDoc) {
    const s = lastSessionDoc;
    lastStrengthSession = {
      date:      s.date ?? null,
      exercises: (s.exercises ?? []).map(ex => ({
        name:             ex.name,
        setsCompleted:    ex.sets,
        repsCompleted:    ex.reps,
        difficultyRating: ex.difficulty,
        completed:        ex.completed,
      })),
    };
  }

  // ── 5. Athlete profile ─────────────────────────────────────────────────────
  let athleteProfile = null;
  if (profile) {
    const p        = profile;
    const identity  = resolveIdentity(p, now);

    // ─── NO MIRWALD/MATURITY ESTIMATE REACHES THE MODEL FROM HERE ────────────
    // This block used to compute maturityOffset() and append a line to
    // identityText that named the band and its stage-derived "implication":
    //
    //   Estimated maturity offset — interpret cautiously: Mid-PHV
    //   (≈0.4 yrs past the estimated growth spurt) — <stage implication>
    //
    // identityText is the first line of the match-analysis prompt AND the
    // season-report prompt, and both of those write deferred priorities and
    // standing season priorities that later steer planning. So a population
    // regression carrying years of individual error was, by that route,
    // shaping what she would be told to work on for the next month.
    //
    // It is gone. The estimate is still calculated for a parent to read (the
    // Me screen, the classic Benchmarks panel) and still carried in the
    // Guardian's own metrics, but it enters no AI decision context. What the
    // model is told about who she is comes from identityBlock: age,
    // competition category, whether she is playing up — measured or
    // administrative facts. Measured height history and observed growth
    // velocity remain available to the components that legitimately use them.
    //
    // maturityIsolation.test.js proves it, by holding every other field fixed
    // and moving the estimate across all three bands.

    athleteProfile = {
      name:                p.name ?? null,
      age:                 computeAge(p.dob, now),
      dob:                 p.dob ?? null,
      competitionCategory: p.competitionCategory ?? null,
      categoryLabel:       identity.categoryLabel,
      playingUp:           identity.playingUp,
      isPlayingUp:         identity.isPlayingUp,
      gaps:                p.gaps ?? [],
      // `phvStage` was a legacy persisted profile field forwarded straight
      // through here — a stored maturity band sitting inside the very object
      // the prompts are built from. Nothing writes it and nothing read it, and
      // it is no longer surfaced. The field itself stays in Firestore
      // untouched; this is not a migration.
      identityText:        identityBlock(p, now),
    };
  }

  // ── 6. Most recent match — last 14 days ────────────────────────────────────
  const recentMatch = selectRecentMatch(matches, athleteUid, now);

  // ── 6b. AI match analysis for the most recent match ───────────────────────
  let matchAnalysis = { criticalFindings: [], deferredPriorities: [] };
  if (recentMatch?.id && matchAnalysisDoc) {
    const a = matchAnalysisDoc;
    matchAnalysis = {
      criticalFindings:   Array.isArray(a.criticalFindings)   ? a.criticalFindings   : [],
      deferredPriorities: Array.isArray(a.deferredPriorities) ? a.deferredPriorities : [],
    };
  }

  // ── 7. Deferred priorities (status = "active") ─────────────────────────────
  const deferredPriorities = (deferredDocs || [])
    .filter(dp => dp.status === "active")
    .map(dp => ({
      priority:          dp.priority   ?? null,
      // `key` lets the next AI call reuse an existing development area instead
      // of inventing a new label for a problem already on the list.
      key:               dp.key        ?? null,
      reason:            dp.reason     ?? null,
      deferredDate:      dp.deferredDate ?? null,
      resolveCondition:  dp.resolveCondition ?? null,
      metricTarget:      dp.metricTarget ?? null,
      weeksDeferredCount: dp.weeksDeferredCount ?? 0,
    }));

  // ── 8. Technical assessments — 3 most recent High priority ────────────────
  let technicalAssessments = [];
  if (technicalAssessmentDocs) {
    const priorityOrder = { High: 0, Medium: 1, Monitor: 2 };
    technicalAssessments = technicalAssessmentDocs
      .filter(a => a.priority === "High" || a.priority === "Medium")
      .sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3))
      .slice(0, 3)
      .map(a => ({
        strokeArea:  a.strokeArea  ?? null,
        category:    a.category    ?? null,
        date:        a.date        ?? null,
        source:      a.source      ?? null,
        assessment:  a.assessment  ?? null,
        priority:    a.priority    ?? null,
      }));
  }

  // ── 9. Athlete development memory ──────────────────────────────────────────
  const memory = memoryDoc ?? null;
  const memoryText = memoryBlock(memory);

  // ── 10. Season report — closes the dead feedback loop ──────────────────────
  // Only nextMonthPriority + longTermOutlook are surfaced (not the whole doc).
  let standingSeasonPriority = null;
  if (seasonReportDoc) {
    const s = seasonReportDoc;
    if (s.nextMonthPriority || s.longTermOutlook) {
      standingSeasonPriority = {
        nextMonthPriority: s.nextMonthPriority ?? null,
        longTermOutlook:   s.longTermOutlook   ?? null,
      };
    }
  }

  // ── 11. Open injuries — closes the load-alert-vs-body-outcome gap ─────────
  // Omit the whole section when there's nothing to say; never render an empty
  // heading. This is what lets match analysis stop attributing a movement
  // problem to technique when her ankle is hurt.
  let injuryText = "";
  let injurySummary = null;
  if (injuryDocs) {
    try {
      const allInjuries = injuryDocs;
      const open = openInjuries(allInjuries);
      const flag = injuryLoadFlag(allInjuries);
      const recurring = recurringAreas(allInjuries);
      if (open.length > 0 || recurring.length > 0) {
        const lines = ["OPEN INJURIES:"];
        for (const i of open) {
          lines.push(`- ${i.bodyArea}${i.side && i.side !== "N/A" ? ` (${i.side})` : ""}: severity ${i.severity}/5, open ${injuryDuration(i, now) ?? "?"} days`);
        }
        if (flag) lines.push(`- Guidance: ${flag.guidance}`);
        if (recurring.length > 0) {
          lines.push(`- Recurring: ${recurring.map(r => `${r.bodyArea} (${r.count}x)`).join(", ")}`);
        }
        injuryText = lines.join("\n");
        injurySummary = { open, flag, recurring };
      }
    } catch { /* malformed data — degrade to the default above */ }
  }

  const context = {
    generatedAt:         now.toISOString(),
    athleteUid,
    sessionLogs,
    wellbeing,
    tournamentStatus,
    lastStrengthSession,
    athleteProfile,
    recentMatch,
    matchAnalysis,
    deferredPriorities,
    technicalAssessments,
    memory,
    memoryText,
    standingSeasonPriority,
    injuries: injurySummary,
    injuryText,
  };

  return context;
}
