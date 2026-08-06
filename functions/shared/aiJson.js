// ─── AI JSON EXTRACTION — PURE CORE ──────────────────────────────────────────
// The parsing half of ai.js, split out so it can run outside Vite. ai.js itself
// reads `import.meta.env` at module scope, which makes it unloadable in a plain
// Node process (Cloud Functions); nothing in this file touches the network, the
// environment or Firebase, so both the browser client and a server runtime can
// share exactly one JSON extractor.
//
// ai.js imports from here and re-exports, so existing importers are unchanged.

export function rawTextOf(data) {
  return (data.content?.[0]?.text ?? data.content?.map(b => b.text || "").join("") ?? "").trim();
}

// Returns the first complete top-level {...} in `text`, or null if there isn't
// one. Scans brace depth while tracking string state and escapes, so a brace
// inside a string value can't close the object early.
//
// This replaces an "the whole reply must be exactly one JSON object" check.
// Models routinely add a preamble ("Here's the season review:") or a closing
// remark, and every prompt here already asks them not to — an instruction that
// is followed most of the time, which is the worst kind. Extracting is robust
// where instructing is not.
export function extractJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped)          { escaped = false; continue; }
    if (ch === "\\")      { if (inString) escaped = true; continue; }
    if (ch === '"')       { inString = !inString; continue; }
    if (inString)         continue;
    if (ch === "{")       depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // opened but never closed — truncated or malformed
}

// Escape literal control characters inside JSON string values.
export function escapeControlChars(text) {
  return text.replace(/"((?:[^"\\]|\\[\s\S])*)"/g, (_, inner) =>
    '"' + inner
      .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") + '"'
  );
}

// A short, single-line look at what the model actually sent, carried in the
// error so the failure is diagnosable from the app rather than only from a
// console nobody has open.
export function beganWith(text) {
  const oneLine = String(text).replace(/\s+/g, " ").trim();
  if (!oneLine) return ' (began: "" — the reply was empty)';
  const head = oneLine.length > 90 ? `${oneLine.slice(0, 89)}…` : oneLine;
  return ` (began: "${head}")`;
}

export function cleanAndParseJson(rawText, stopReason) {
  const text = String(rawText ?? "");
  const candidate = extractJsonObject(text);

  if (candidate === null) {
    // No closing brace: either the reply ran out of room or it isn't JSON.
    if (stopReason === "max_tokens") {
      throw new Error("AI response was truncated — max_tokens too low");
    }
    console.error("AI raw response (unparseable):", text);
    throw new Error(`AI response was not valid JSON${beganWith(text)}`);
  }

  try {
    return JSON.parse(escapeControlChars(candidate));
  } catch {
    if (stopReason === "max_tokens") {
      throw new Error("AI response was truncated — max_tokens too low");
    }
    console.error("AI raw response (unparseable):", text);
    throw new Error(`AI response was not valid JSON${beganWith(text)}`);
  }
}
