import { db } from "../firebase";
import {
  collection, getDocs, query, orderBy, limit, doc, getDoc,
} from "firebase/firestore";
import { sessionSRPE, computeLoad } from "./load.js";

// ─── ATHLETE CONTEXT BUILDER ─────────────────────────────────────────────────
// Assembles a unified context object from Firestore before every AI analysis.
// tournamentStatus lives at: athletes/{uid}/config/tournamentStatus
// deferredPriorities live at: athletes/{uid}/deferredPriorities (status="active")
export async function buildAthleteContext(athleteUid) {
  const now       = new Date();
  const msPerDay  = 24 * 60 * 60 * 1000;
  const cutoff28  = new Date(now - 28 * msPerDay).toISOString().slice(0, 10);
  const cutoff14  = new Date(now - 14 * msPerDay).toISOString().slice(0, 10);
  const cutoff7   = new Date(now - 7  * msPerDay).toISOString().slice(0, 10);

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
    const tSnap = await getDoc(doc(db, "athletes", athleteUid, "config", "tournamentStatus"));
    if (tSnap.exists()) {
      const t        = tSnap.data();
      const daysUntil = t.upcomingTournamentDate
        ? Math.round((new Date(t.upcomingTournamentDate) - now) / msPerDay)
        : null;
      const daysSince = t.lastTournamentDate
        ? Math.round((now - new Date(t.lastTournamentDate)) / msPerDay)
        : null;
      tournamentStatus = {
        hasUpcomingTournament:    daysUntil != null && daysUntil >= 0,
        daysUntilTournament:      daysUntil != null && daysUntil >= 0 ? daysUntil : null,
        playedTournamentRecently: daysSince != null && daysSince <= 14,
        daysSinceTournament:      daysSince,
      };
    }
  } catch (_) { /* document not yet created — defaults stand */ }

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
    const p   = profileSnap.data();
    const dob = p.dob ? new Date(p.dob) : null;
    athleteProfile = {
      name:       p.name ?? null,
      age:        dob ? Math.floor((now - dob) / (365.25 * msPerDay)) : null,
      tennisSaps: p.gaps ?? [],
      phvStage:   p.phvStage ?? null,
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
    } catch (_) {}
  }

  // ── 7. Deferred priorities (status = "active") ─────────────────────────────
  const dpSnap = await getDocs(collection(db, "athletes", athleteUid, "deferredPriorities"));
  const deferredPriorities = dpSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(dp => dp.status === "active")
    .map(dp => ({
      priority:          dp.priority   ?? null,
      reason:            dp.reason     ?? null,
      deferredDate:      dp.deferredDate ?? null,
      resolveCondition:  dp.resolveCondition ?? null,
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
  } catch (_) {}

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
  };

  return context;
}
