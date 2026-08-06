import { db } from "../firebase";
import {
  collection, getDocs, query, orderBy, limit, doc, getDoc,
} from "firebase/firestore";
import { loadMemory } from "./athleteMemory.js";
import { assembleAthleteContext, selectRecentMatch } from "./athleteContextCore.js";

// ─── ATHLETE CONTEXT BUILDER ─────────────────────────────────────────────────
// Runs the client-SDK reads and hands the raw documents to the pure core, which
// owns every decision (cutoffs, sRPE mapping, wellbeing averages and streaks,
// tournament proximity, maturity, deferred projection, memory block, injury
// text). Keeping the assembly in athleteContextCore.js is what lets a Cloud
// Function build the identical context from admin-SDK reads.
//
// tournamentStatus lives at: athletes/{uid}/config/tournamentStatus
// deferredPriorities live at: athletes/{uid}/deferredPriorities (status="active")
export async function buildAthleteContext(athleteUid) {
  const now = new Date();

  // ── 1. Session logs (weekLogs) ─────────────────────────────────────────────
  const logsSnap = await getDocs(
    query(collection(db, "athletes", athleteUid, "weekLogs"), orderBy("date", "desc"))
  );
  const weekLogs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ── 2. Wellbeing ───────────────────────────────────────────────────────────
  const wellSnap = await getDocs(
    query(collection(db, "athletes", athleteUid, "wellbeing"), orderBy("date", "desc"), limit(14))
  );
  const wellbeing = wellSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ── 3. Tournaments (+ legacy tournamentStatus doc) ─────────────────────────
  let tournaments = null;
  let tournamentStatusDoc = null;
  try {
    const tourSnap = await getDocs(collection(db, "athletes", athleteUid, "tournaments"));
    const docs = tourSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (docs.length === 0) {
      const tSnap = await getDoc(doc(db, "athletes", athleteUid, "config", "tournamentStatus"));
      tournamentStatusDoc = tSnap.exists() ? tSnap.data() : null;
    }
    // Assigned last: if either read throws, `tournaments` stays null and the
    // core keeps its defaults — the same degradation as before the extraction.
    tournaments = docs;
  } catch { /* document not yet created — the core's defaults stand */ }

  // ── 4. Last strength session ───────────────────────────────────────────────
  const strengthSnap = await getDocs(
    query(collection(db, "athletes", athleteUid, "sessions"), orderBy("date", "desc"), limit(1))
  );
  const lastStrengthSession = strengthSnap.empty ? null : strengthSnap.docs[0].data();

  // ── 5. Athlete profile ─────────────────────────────────────────────────────
  const profileSnap = await getDoc(doc(db, "athletes", athleteUid));
  const profile = profileSnap.exists() ? profileSnap.data() : null;

  // ── 6. Matches (+ the AI analysis for the most recent one) ─────────────────
  const matchesSnap = await getDocs(collection(db, "matches"));
  const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const recentMatch = selectRecentMatch(matches, athleteUid, now);
  let matchAnalysisDoc = null;
  if (recentMatch?.id) {
    try {
      const analysisSnap = await getDoc(doc(db, "athletes", athleteUid, "matchAnalyses", recentMatch.id));
      matchAnalysisDoc = analysisSnap.exists() ? analysisSnap.data() : null;
    } catch { /* absent or unreadable — the core degrades to its default */ }
  }

  // ── 7. Deferred priorities ─────────────────────────────────────────────────
  const dpSnap = await getDocs(collection(db, "athletes", athleteUid, "deferredPriorities"));
  const deferredDocs = dpSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ── 8. Technical assessments ───────────────────────────────────────────────
  let technicalAssessments = null;
  try {
    const taSnap = await getDocs(
      query(collection(db, "athletes", athleteUid, "technicalAssessments"), orderBy("date", "desc"), limit(30))
    );
    technicalAssessments = taSnap.docs.map(d => d.data());
  } catch { /* absent or unreadable — the core degrades to its default */ }

  // ── 9. Athlete development memory (loadMemory never throws) ────────────────
  const memoryDoc = await loadMemory(athleteUid);

  // ── 10. Season report ──────────────────────────────────────────────────────
  let seasonReportDoc = null;
  try {
    const seasonSnap = await getDoc(doc(db, "athletes", athleteUid, "reports", "seasonLatest"));
    seasonReportDoc = seasonSnap.exists() ? seasonSnap.data() : null;
  } catch { /* absent or unreadable — the core degrades to its default */ }

  // ── 11. Injuries ───────────────────────────────────────────────────────────
  let injuries = null;
  try {
    const injSnap = await getDocs(collection(db, "athletes", athleteUid, "injuries"));
    injuries = injSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { /* absent or unreadable — the core degrades to its default */ }

  return assembleAthleteContext({
    athleteUid,
    weekLogs,
    wellbeing,
    tournaments,
    tournamentStatusDoc,
    lastStrengthSession,
    profile,
    matches,
    matchAnalysisDoc,
    deferredDocs,
    technicalAssessments,
    memoryDoc,
    seasonReportDoc,
    injuries,
  }, now);
}
