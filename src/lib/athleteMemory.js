import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import { callClaudeJSON } from "./ai.js";
import {
  CAPS, emptyMemory, recordDivisionChange,
  buildMemoryUpdatePrompt, mergeMemoryUpdate,
} from "./athleteMemoryCore.js";

// ─── ATHLETE DEVELOPMENT MEMORY — PERSISTENCE ───────────────────────────────
// A bounded, persistent longitudinal store the AI reads before every analysis
// so it has a continuous understanding of the athlete rather than a single
// stateless prompt. Singleton doc, same pattern as plans/current and
// gamification/state: athletes/{athleteId}/memory/current.
//
// Caps are enforced IN CODE (capMemory), never left to the model's discretion,
// so prompt size stays flat no matter how long the season runs.
//
// The pure half lives in athleteMemoryCore.js and is re-exported here so
// existing importers keep working unchanged.
export { emptyMemory, capMemory, memoryBlock, recordDivisionChange } from "./athleteMemoryCore.js";

const docRef = (athleteId) => doc(db, "athletes", athleteId, "memory", "current");

// ── loadMemory ───────────────────────────────────────────────────────────────
// Never throws — a memory read failure degrades to emptyMemory() so callers
// never need their own try/catch around this.
export async function loadMemory(athleteId) {
  try {
    if (!athleteId) return emptyMemory();
    const snap = await getDoc(docRef(athleteId));
    if (!snap.exists()) return emptyMemory();
    return { ...emptyMemory(), ...snap.data() };
  } catch {
    return emptyMemory();
  }
}

// ── updateMemoryFromMatch ────────────────────────────────────────────────────
// Makes ONE small callClaudeJSON asking the model to REVISE AND MERGE the
// existing memory with new match-analysis evidence — not append blindly.
// Non-fatal by contract: callers must wrap in try/catch (matchAnalysis.js
// does). Any failure here must never break match-analysis generation.
export async function updateMemoryFromMatch(athleteId, { profile, match, analysis }) {
  if (!athleteId) return null;
  const current = await loadMemory(athleteId);

  const todayStr = new Date().toISOString().slice(0, 10);
  const division = match?.ageCategory ?? profile?.competitionCategory ?? null;
  const withDivision = recordDivisionChange(current, division, todayStr);

  const { system, userContent, maxTokens } = buildMemoryUpdatePrompt(withDivision, {
    kind: "match", todayStr, match, analysis,
  });

  const parsed = await callClaudeJSON({ system, userContent, maxTokens });

  const merged = mergeMemoryUpdate(withDivision, parsed, new Date().toISOString());

  setDoc(docRef(athleteId), merged).catch(e => console.error("athleteMemory save (match):", e));
  return merged;
}

// ── updateMemoryFromSeasonReport ─────────────────────────────────────────────
// Same revise-and-merge contract as updateMemoryFromMatch, but sourced from a
// full season report rather than a single match.
export async function updateMemoryFromSeasonReport(athleteId, { profile, report }) {
  if (!athleteId) return null;
  const current = await loadMemory(athleteId);

  const todayStr = new Date().toISOString().slice(0, 10);
  const division = profile?.competitionCategory ?? null;
  const withDivision = recordDivisionChange(current, division, todayStr);

  const { system, userContent, maxTokens } = buildMemoryUpdatePrompt(withDivision, {
    kind: "season", todayStr, report,
  });

  const parsed = await callClaudeJSON({ system, userContent, maxTokens });

  const merged = mergeMemoryUpdate(withDivision, parsed, new Date().toISOString());

  setDoc(docRef(athleteId), merged).catch(e => console.error("athleteMemory save (season):", e));
  return merged;
}

// ── pushShoutout ─────────────────────────────────────────────────────────────
// Code-only ring buffer — NO LLM call. Newest first, capped.
export async function pushShoutout(athleteId, text) {
  if (!athleteId || !text) return;
  try {
    const current = await loadMemory(athleteId);
    const shoutouts = [text, ...(current.shoutouts || [])].slice(0, CAPS.shoutouts);
    await setDoc(docRef(athleteId), { ...current, shoutouts, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("pushShoutout:", e);
  }
}

// ── deleteMemoryPattern ───────────────────────────────────────────────────────
// Removes one persistentPatterns entry by exact `pattern` text match, so a
// parent can correct the AI's memory if it records something wrong.
export async function deleteMemoryPattern(athleteId, pattern) {
  if (!athleteId || !pattern) return;
  const current = await loadMemory(athleteId);
  const persistentPatterns = (current.persistentPatterns || []).filter(p => p.pattern !== pattern);
  await setDoc(docRef(athleteId), { ...current, persistentPatterns, updatedAt: new Date().toISOString() });
}
