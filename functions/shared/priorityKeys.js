import { METRIC_IDS, PRIORITY_METRICS } from "./priorityMetrics.js";

// ─── FOCUS PRIORITY IDENTITY — PURE CORE ─────────────────────────────────────
// Answers one question: are these two deferred priorities the same development
// area? Deliberately free of any Firestore import so it can be unit tested in
// the default node environment (same split as athleteMemoryCore.js).
//
// Two AI calls write into the same deferredPriorities collection — the match
// analysis and the Sunday plan — and each invents the wording afresh. Matching
// on exact string equality let "Second serve consistency" and "Improve 2nd
// serve reliability" pile up as separate active rows. Matching runs on `key`
// first (the AI now picks one from the taxonomy below) and falls back to token
// similarity for the legacy docs written before `key` existed.

export const PRIORITY_KEYS = [
  { id: "first_serve",             label: "First serve" },
  { id: "second_serve",            label: "Second serve" },
  { id: "serve_placement",         label: "Serve placement" },
  { id: "return_of_serve",         label: "Return of serve" },
  { id: "forehand_consistency",    label: "Forehand consistency" },
  { id: "forehand_offense",        label: "Forehand offense" },
  { id: "backhand_consistency",    label: "Backhand consistency" },
  { id: "backhand_offense",        label: "Backhand offense" },
  { id: "net_play",                label: "Net play / approach" },
  { id: "drop_shot",               label: "Drop shot" },
  { id: "rally_tolerance",         label: "Rally tolerance (long points)" },
  { id: "short_point_conversion",  label: "Short point conversion" },
  { id: "movement_footwork",       label: "Movement & footwork" },
  { id: "error_control",           label: "Unforced error control" },
  { id: "tactical_patterns",       label: "Tactical patterns" },
  { id: "physical_conditioning",   label: "Physical conditioning" },
  { id: "mental_competitive",      label: "Mental / competitive" },
  { id: "other",                   label: "Other" },
];

const KEY_IDS = new Set(PRIORITY_KEYS.map(k => k.id));

// `other` is the AI's escape hatch, so it must never make two unrelated
// priorities look identical — only real taxonomy keys short-circuit matching.
export const isRealKey = (key) => typeof key === "string" && KEY_IDS.has(key) && key !== "other";

// Words that carry no distinguishing meaning in a priority label. Dropping them
// stops "Improve second serve" and "Second serve" from scoring as different.
const FILLER = new Set([
  "a", "an", "and", "at", "be", "better", "build", "control", "develop", "during",
  "expand", "fix", "for", "from", "get", "greater", "her", "his", "improve",
  "improved", "improving", "in", "increase", "increased", "into", "is", "its",
  "keep", "less", "level", "levels", "lower", "make", "more", "of", "on", "onto",
  "over", "raise", "reduce", "reduced", "the", "their", "to", "under", "up",
  "with", "work", "working",
]);

// Ordinal shorthand the model uses interchangeably with the spelled-out form.
const SYNONYM = {
  "1st": "first",
  "2nd": "second",
  "one": "first",
  "two": "second",
  "fh": "forehand",
  "bh": "backhand",
  "ue": "unforced",
  "df": "double",
  "pct": "percentage",
  "percent": "percentage",
  "pts": "points",
  "pt": "point",
  "serves": "serve",
  "serving": "serve",
  "errors": "error",
  "winners": "winner",
  "rallies": "rally",
  "shots": "shot",
  "points": "point",
  "games": "game",
  "consistent": "consistency",
  "consistently": "consistency",
  "reliability": "consistency",
  "reliable": "consistency",
  "depth": "deep",
  "placements": "placement",
};

// ── normalizeTokens ──────────────────────────────────────────────────────────
// Pure. Lowercases, splits on anything non-alphanumeric, maps synonyms and
// drops filler. Returns a de-duplicated token list.
export function normalizeTokens(label) {
  if (typeof label !== "string") return [];
  const raw = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const out = [];
  for (const word of raw) {
    const mapped = SYNONYM[word] ?? word;
    if (FILLER.has(mapped)) continue;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

// ── normalizeLabel ───────────────────────────────────────────────────────────
// Pure. Stable canonical form of a label — tokens sorted so word order can't
// make two identical priorities look different.
export const normalizeLabel = (label) => normalizeTokens(label).sort().join(" ");

// ── similarity ───────────────────────────────────────────────────────────────
// Pure. Jaccard overlap of the normalized token sets, 0–1.
export function similarity(a, b) {
  const ta = normalizeTokens(a);
  const tb = normalizeTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const shared = ta.filter(t => setB.has(t)).length;
  return shared / (ta.length + tb.length - shared);
}

// Tuned against the real duplicates in her data: "second serve consistency" vs
// "second serve reliability" must merge (1.0 after synonym mapping), while
// "forehand consistency" vs "backhand consistency" must not (0.33).
export const SIMILARITY_THRESHOLD = 0.6;

// ── samePriority ─────────────────────────────────────────────────────────────
// Pure. Accepts either a priority doc ({ priority, key }) or a bare label
// string, so callers can compare a Firestore doc against an AI-returned item
// without unwrapping either.
export function samePriority(a, b) {
  const labelOf = (x) => (typeof x === "string" ? x : x?.priority ?? "");
  const keyOf   = (x) => (typeof x === "string" ? null : x?.key ?? null);

  const keyA = keyOf(a);
  const keyB = keyOf(b);
  // A real key on BOTH sides is authoritative in both directions: same key
  // means same area, different keys mean the model deliberately separated them.
  if (isRealKey(keyA) && isRealKey(keyB)) return keyA === keyB;

  const labelA = labelOf(a);
  const labelB = labelOf(b);
  if (!labelA || !labelB) return false;
  if (normalizeLabel(labelA) === normalizeLabel(labelB)) return true;

  return similarity(labelA, labelB) >= SIMILARITY_THRESHOLD;
}

// ── textAddressesPriority ────────────────────────────────────────────────────
// Pure. Does a free-text sentence (e.g. an exercise's tennisConnection) address
// a given deferred priority? This is NOT samePriority(text, priorityDoc) — a
// direct label-vs-label Jaccard comparison systematically fails here because a
// full sentence carries far more tokens than a short priority label, diluting
// the overlap below SIMILARITY_THRESHOLD even for an obviously-matching
// rewording (verified: "Improve second serve reliability" vs "Builds a
// heavier, more consistent 2nd serve under pressure" scores 0.5, not >= 0.6).
// So this uses a containment measure instead of symmetric Jaccard: does the
// text contain the priority's defining tokens, rather than do the two token
// sets overlap proportionally to their combined size.
export function textAddressesPriority(text, priorityDoc) {
  if (!text || !priorityDoc) return false;
  const textTokens = normalizeTokens(text);
  if (textTokens.length === 0) return false;
  const textSet = new Set(textTokens);

  // A real taxonomy key is authoritative: if every token of that key's own
  // canonical label shows up in the text, the sentence is about that area
  // regardless of how the priority itself was worded.
  const key = priorityDoc?.key;
  if (isRealKey(key)) {
    const keyDef = PRIORITY_KEYS.find(k => k.id === key);
    const keyTokens = keyDef ? normalizeTokens(keyDef.label) : [];
    if (keyTokens.length > 0 && keyTokens.every(t => textSet.has(t))) return true;
  }

  // Otherwise fall back to containment against the priority's own label:
  // what fraction of the priority's tokens are present in the text.
  const priorityTokens = normalizeTokens(priorityDoc.priority);
  if (priorityTokens.length === 0) return false;
  const shared = priorityTokens.filter(t => textSet.has(t)).length;
  return shared / priorityTokens.length >= SIMILARITY_THRESHOLD;
}

// ── clusterPriorities ────────────────────────────────────────────────────────
// Pure. Groups docs that describe the same development area. Each cluster is
// sorted oldest → newest by `sortDate` (deferredDate, coerced by the caller),
// so cluster[cluster.length - 1] is the newest wording and cluster[0] the
// original. Docs never move between clusters once placed — first match wins,
// which keeps the result stable regardless of input order for real data.
export function clusterPriorities(docs) {
  const clusters = [];
  for (const d of docs || []) {
    if (!d) continue;
    const hit = clusters.find(c => c.some(existing => samePriority(existing, d)));
    if (hit) hit.push(d);
    else clusters.push([d]);
  }
  const key = (d) => String(d?.sortDate ?? "");
  return clusters.map(c => [...c].sort((x, y) => key(x).localeCompare(key(y))));
}

// ── deferredPrioritySchemaBlock ──────────────────────────────────────────────
// Pure. The shared instruction block for every prompt that asks the model for
// deferred priorities (match analysis and the Sunday plan). Kept in one place so
// the two prompts can never drift out of agreement about the taxonomy or the
// metric ids the auto-resolver understands.
export function deferredPrioritySchemaBlock() {
  const keys    = PRIORITY_KEYS.map(k => k.id).join(" | ");
  const metrics = METRIC_IDS.map(id => `${id} (${PRIORITY_METRICS[id].label})`).join(", ");

  return `DEFERRED PRIORITY RULES — follow exactly:
- "key" MUST be one of: ${keys}
- If a priority is the SAME development area as one already listed above, reuse that item's exact "key". Do not re-word an existing problem into what looks like a new one.
- Use "other" only when nothing else fits.
- "metricTarget" is ONLY for a priority derived from a match statistic — otherwise set it to null.
  "metric" MUST be one of: ${metrics}
  "comparator" is one of >=, >, <=, < and "value" is a number (percentages as 0-100).
  The priority resolves automatically once that target holds across her next two measurable matches, so set a realistic next step rather than an end-state ideal.`;
}

// ── renderExistingPriorities ─────────────────────────────────────────────────
// Pure. Renders the open priorities for a prompt, including the key so the
// model can reuse it rather than inventing a fresh label for the same problem.
export function renderExistingPriorities(items) {
  if (!items || items.length === 0) return "None";
  return items.map(d => {
    const weeks = d.weeksDeferredCount ?? 0;
    const parts = [`- [key: ${d.key || "unset"}] ${d.priority} (deferred ${weeks} wk${weeks === 1 ? "" : "s"})`];
    if (d.resolveCondition) parts.push(` — resolve when: ${d.resolveCondition}`);
    return parts.join("");
  }).join("\n");
}
