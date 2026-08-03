import { db } from "../firebase";
import {
  collection, getDocs, query, orderBy, limit, doc, getDoc,
} from "firebase/firestore";
import { sessionSRPE, computeLoad } from "./load.js";
import { toLocalDateStr } from "./dates.js";
import { nearestUpcoming, daysUntil } from "./tournaments.js";
import { computeAge, identityBlock, resolveIdentity } from "./athleteIdentity.js";
import { maturityOffset, stageInfo } from "./maturity.js";
import { loadMemory, memoryBlock } from "./athleteMemory.js";
import { openInjuries, injuryLoadFlag, injuryDuration, recurringAreas } from "./injuries.js";

// ─── ATHLETE CONTEXT BUILDER ─────────────────────────────────────────────────
// Assembles a unified context object from Firestore before every AI analysis.
// tournamentStatus lives at: athletes/{uid}/config/tournamentStatus
// deferredPriorities live at: athletes/{uid}/deferredPriorities (status="active")
export async function buildAthleteContext(athleteUid) {
  const now       = new Date();
  const msPerDay  = 24 * 60 * 60 * 1000;
  const cutoff28  = toLocalDateStr(new Date(now - 28 * msPerDay));
  const cutoff14  = toLocalDateStr(new Date(now - 14 * msPerDay));
  const cutoff7   = toLocalDateStr(new Date(now - 7  * msPerDay));

  // ── 1. Session logs (weekLogs) — last 28 days ──────────────────────────────
  const logsSnap = await getDocs(
    query(collection(db, "athletes", athleteUid, "weekLogs"), orderBy("date", "desc"))
  );
  const allLogs = logsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(l => l.date >= cutoff28);

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
  const wellSnap = await getDocs(
    query(collection(db, "athletes", athleteUid, "wellbeing"), orderBy("date", "desc"), limit(14))
  );
  const wellEntries = wellSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(w => w.date >= cutoff7);

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
    const tourSnap = await getDocs(collection(db, "athletes", athleteUid, "tournaments"));
    const tournaments = tourSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (tournaments.length > 0) {
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
    } else {
      // Legacy fallback — no code writes this doc anymore, kept only for
      // any pre-existing accounts that still have one.
      const tSnap = await getDoc(doc(db, "athletes", athleteUid, "config", "tournamentStatus"));
      if (tSnap.exists()) {
        const t        = tSnap.data();
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
    }
  } catch { /* document not yet created — defaults stand */ }

  // ── 4. Last strength session ───────────────────────────────────────────────
  const strengthSnap = await getDocs(
    query(collection(db, "athletes", athleteUid, "sessions"), orderBy("date", "desc"), limit(1))
  );
  let lastStrengthSession = null;
  if (!strengthSnap.empty) {
    const s = strengthSnap.docs[0].data();
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
  const profileSnap = await getDoc(doc(db, "athletes", athleteUid));
  let athleteProfile = null;
  if (profileSnap.exists()) {
    const p        = profileSnap.data();
    const identity  = resolveIdentity(p, now);

    // Maturation line for the AI: uses the latest measurement carrying a
    // sitting-height reading (measurements are stored newest-first), falling
    // back to the top-level profile fields when that entry omits height/weight.
    const latestWithSittingHeight = (p.measurements ?? []).find(m => m.sittingHeight != null);
    const maturity = latestWithSittingHeight
      ? maturityOffset({
          dob:             p.dob,
          heightCm:        latestWithSittingHeight.height ?? p.height,
          sittingHeightCm: latestWithSittingHeight.sittingHeight ?? p.sittingHeight,
          weightKg:        latestWithSittingHeight.weight ?? p.weight,
          date:            now,
        })
      : null;
    const maturityLine = maturity
      ? `Maturation: ${maturity.stage} (≈${Math.abs(maturity.offset).toFixed(1)} yrs ${maturity.offset < 0 ? "from" : "past"} peak height velocity) — ${stageInfo(maturity.stage)?.implication ?? ""}`
      : null;

    athleteProfile = {
      name:                p.name ?? null,
      age:                 computeAge(p.dob, now),
      dob:                 p.dob ?? null,
      competitionCategory: p.competitionCategory ?? null,
      categoryLabel:       identity.categoryLabel,
      playingUp:           identity.playingUp,
      isPlayingUp:         identity.isPlayingUp,
      gaps:                p.gaps ?? [],
      phvStage:            p.phvStage ?? null,
      maturityLine,
      identityText:        identityBlock(p, now) + (maturityLine ? `\n${maturityLine}` : ""),
    };
  }

  // ── 6. Most recent match — last 14 days ────────────────────────────────────
  const matchesSnap = await getDocs(collection(db, "matches"));
  const recentMatch = matchesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => m.athleteId === athleteUid && (m.matchStartTime ?? "") >= cutoff14)
    .sort((a, b) => (b.matchStartTime ?? "").localeCompare(a.matchStartTime ?? ""))[0] ?? null;

  // ── 6b. AI match analysis for the most recent match ───────────────────────
  let matchAnalysis = { criticalFindings: [], deferredPriorities: [] };
  if (recentMatch?.id) {
    try {
      const analysisSnap = await getDoc(doc(db, "athletes", athleteUid, "matchAnalyses", recentMatch.id));
      if (analysisSnap.exists()) {
        const a = analysisSnap.data();
        matchAnalysis = {
          criticalFindings:   Array.isArray(a.criticalFindings)   ? a.criticalFindings   : [],
          deferredPriorities: Array.isArray(a.deferredPriorities) ? a.deferredPriorities : [],
        };
      }
    } catch { /* absent or unreadable — degrade to the default above */ }
  }

  // ── 7. Deferred priorities (status = "active") ─────────────────────────────
  const dpSnap = await getDocs(collection(db, "athletes", athleteUid, "deferredPriorities"));
  const deferredPriorities = dpSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
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
  try {
    const taSnap = await getDocs(
      query(collection(db, "athletes", athleteUid, "technicalAssessments"), orderBy("date", "desc"), limit(30))
    );
    const priorityOrder = { High: 0, Medium: 1, Monitor: 2 };
    technicalAssessments = taSnap.docs
      .map(d => d.data())
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
  } catch { /* absent or unreadable — degrade to the default above */ }

  // ── 9. Athlete development memory ──────────────────────────────────────────
  let memory;
  let memoryText;
  try {
    memory = await loadMemory(athleteUid);
    memoryText = memoryBlock(memory);
  } catch {
    memory = null;
    memoryText = "";
  }

  // ── 10. Season report — closes the dead feedback loop ──────────────────────
  // Only nextMonthPriority + longTermOutlook are surfaced (not the whole doc).
  let standingSeasonPriority = null;
  try {
    const seasonSnap = await getDoc(doc(db, "athletes", athleteUid, "reports", "seasonLatest"));
    if (seasonSnap.exists()) {
      const s = seasonSnap.data();
      if (s.nextMonthPriority || s.longTermOutlook) {
        standingSeasonPriority = {
          nextMonthPriority: s.nextMonthPriority ?? null,
          longTermOutlook:   s.longTermOutlook   ?? null,
        };
      }
    }
  } catch { /* absent or unreadable — degrade to the default above */ }

  // ── 11. Open injuries — closes the load-alert-vs-body-outcome gap ─────────
  // Omit the whole section when there's nothing to say; never render an empty
  // heading. This is what lets match analysis stop attributing a movement
  // problem to technique when her ankle is hurt.
  let injuryText = "";
  let injurySummary = null;
  try {
    const injSnap = await getDocs(collection(db, "athletes", athleteUid, "injuries"));
    const allInjuries = injSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  } catch { /* absent or unreadable — degrade to the default above */ }

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
