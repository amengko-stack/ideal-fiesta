import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { currentWeekKey } from "./dates.js";
import {
  resolveProgramState, startNextBlock, readProgramState,
  PROGRAM_STATE_DOC,
} from "./weeklyPlanCore.js";

// ─── STRENGTH PROGRAM STATE — FIRESTORE WIRING ───────────────────────────────
// athletes/{athleteId}/programState/strength is the canonical chronology of the
// eight-week block. Every decision about WHERE the athlete is lives in
// weeklyPlanCore.js (pure, shared with the Cloud Function); this file only
// reads and writes the document.
//
// The document is deliberately separate from plans/current: a plan is an
// output, and an output that also stores chronology restarts the athlete at
// week 1 the first time anybody deletes or regenerates it.

const stateRef = (athleteId) =>
  doc(db, "athletes", athleteId, PROGRAM_STATE_DOC.collection, PROGRAM_STATE_DOC.id);

export async function loadProgramState(athleteId) {
  if (!athleteId) return null;
  try {
    const snap = await getDoc(stateRef(athleteId));
    return snap.exists() ? snap.data() : null;
  } catch {
    // Offline or unreadable: the caller migrates from what it has rather than
    // failing the whole plan generation.
    return null;
  }
}

// ── ensureProgramState ───────────────────────────────────────────────────────
// Reads the state, migrating it into existence on first use, and persists it
// only when something actually changed (first write, or the active → completed
// transition). Returns { state, position } — `position.blockWeek` is what the
// plan generator prescribes from.
export async function ensureProgramState(athleteId, { previousPlan = null, weekKey = currentWeekKey(), now = new Date() } = {}) {
  const stored = await loadProgramState(athleteId);
  const resolved = resolveProgramState({ state: stored, previousPlan, currentWeekKey: weekKey, now });

  if (athleteId && resolved.changed) {
    await setDoc(stateRef(athleteId), resolved.state).catch(e =>
      console.error("programState save:", e)
    );
  }
  return { state: resolved.state, position: resolved.position, migrated: resolved.migrated, transition: resolved.transition };
}

// ── startNextStrengthBlock ───────────────────────────────────────────────────
// The explicit new-block transition, triggered by a person after the week-8
// review — never as a side effect of generating a plan. Returns the new state.
export async function startNextStrengthBlock(athleteId, { weekKey = currentWeekKey(), now = new Date() } = {}) {
  const stored = await loadProgramState(athleteId);
  const next = startNextBlock(stored, weekKey, now);
  if (athleteId) {
    await setDoc(stateRef(athleteId), next);
  }
  return { state: next, position: readProgramState(next, weekKey) };
}
