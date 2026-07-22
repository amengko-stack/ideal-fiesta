// ─── AUTO-RESOLVE ─────────────────────────────────────────────────────────────
// Pure helpers deciding which deferred coaching priorities a match's statistics
// have satisfied. Kept firebase-free so it can be unit-tested; the actual
// Firestore writes happen in matchAnalysis.js via resolveDeferred().

// Does this match carry enough statistics to judge a resolve condition at all?
// A stats-free import (or an empty doc) can't clear anything; a quick-mode live
// match still has serve/point tallies and can.
export function hasResolvableStats(match) {
  const v = match?.valissa || {};
  return v.firstServePct != null || v.winners != null || v.unforcedErrors != null;
}

// Filters the AI's proposed `resolvedPriorities` down to a safe, actionable set:
//  - the label must exactly match a currently-deferred priority (so the model
//    can't resolve something it wasn't shown, or hallucinate a label),
//  - it must not also appear in this same analysis's re-deferred list,
//  - entries are shape-validated and de-duplicated.
// activeDeferred: [{ priority, ... }]; justDeferred: [{ priority, ... }] | undefined
export function selectAutoResolvable(resolvedPriorities, activeDeferred, justDeferred = []) {
  if (!Array.isArray(resolvedPriorities)) return [];
  const known = new Set(
    (activeDeferred || []).map(d => d?.priority).filter(p => typeof p === "string")
  );
  const reDeferred = new Set(
    (justDeferred || []).map(d => d?.priority).filter(p => typeof p === "string")
  );
  const seen = new Set();
  const out = [];
  for (const item of resolvedPriorities) {
    const label = typeof item === "string" ? item : item?.priority;
    if (typeof label !== "string" || !label.trim()) continue;
    if (!known.has(label) || reDeferred.has(label) || seen.has(label)) continue;
    seen.add(label);
    out.push({ priority: label, evidence: (item && item.evidence) || null });
  }
  return out;
}
