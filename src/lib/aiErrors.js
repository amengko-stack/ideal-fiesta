// ─── AI ERROR MESSAGES ───────────────────────────────────────────────────────
// Turns a thrown AI-pipeline error into something a parent can act on.
//
// Every AI action used to catch its failure and show one generic toast
// ("Couldn't generate — try again later"), which made five completely
// different problems — no stored analyses, a dead API key, a truncated reply,
// malformed JSON, a real bug — indistinguishable from each other and from the
// outside impossible to report. The real error only reached console.error.
//
// Pure module: no Firestore, no network. Must stay that way, or the
// import-graph guard in athleteMemoryCore.test.js will fail the build.

const MAX_LEN = 140;

// Ordered: first match wins, so put specific patterns before general ones.
const RULES = [
  {
    match: /no match analyses found/i,
    message: "Analyse at least one match first — the season review is built from them.",
  },
  {
    match: /truncated|max_tokens too low/i,
    message: "The AI's reply was too long to finish. Try again.",
  },
  {
    match: /not valid json/i,
    message: "The AI returned a malformed reply. Try again.",
  },
  {
    // Checked after the more specific cases above, since the proxy prefixes
    // transport failures with this and the message may carry a status code.
    match: /ai request failed/i,
    message: "The AI service rejected the request — check the API key and its credit.",
  },
  {
    match: /failed to fetch|networkerror|load failed/i,
    message: "Couldn't reach the AI service — check your connection.",
  },
];

function truncate(text) {
  const t = String(text).trim();
  return t.length > MAX_LEN ? `${t.slice(0, MAX_LEN - 1)}…` : t;
}

// Returns a short, specific, user-facing sentence. Never returns an empty
// string, and never hides an unrecognised error behind a generic phrase — an
// unknown message is more useful verbatim than replaced with "try again".
export function friendlyAiError(err) {
  const raw =
    typeof err === "string" ? err
    : err?.message ? err.message
    : "";

  if (!raw.trim()) return "Something went wrong — no error detail was reported.";

  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.message;
  }
  return truncate(raw);
}
