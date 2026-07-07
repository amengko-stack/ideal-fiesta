// ─── AI PROXY CLIENT ─────────────────────────────────────────────────────────
// In development the Express proxy runs on localhost:3001.
// In production (Firebase Hosting) /api/chat is rewritten to the Cloud Function.
const API_URL = import.meta.env.DEV
  ? "http://localhost:3001/api/chat"
  : "/api/chat";

async function postChat({ system, userContent, maxTokens }) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system,
      messages: [{ role: "user", content: userContent }],
      max_tokens: maxTokens,
    }),
  });
  const data = await res.json();
  if (!res.ok || data?.error || data?.type === "error") {
    throw new Error(`AI request failed: ${data?.error?.message || data?.error || res.status}`);
  }
  return data;
}

export function rawTextOf(data) {
  return (data.content?.[0]?.text ?? data.content?.map(b => b.text || "").join("") ?? "").trim();
}

export function cleanAndParseJson(rawText, stopReason) {
  const cleanText = rawText
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleanText.endsWith("}")) {
    throw new Error(stopReason === "max_tokens"
      ? "AI response was truncated — max_tokens too low"
      : "AI response was not valid JSON");
  }
  // Escape literal control characters inside JSON string values
  const clean = cleanText.replace(/"((?:[^"\\]|\\[\s\S])*)"/g, (_, inner) =>
    '"' + inner
      .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") + '"'
  );
  return JSON.parse(clean);
}

// POST a prompt and parse the model's JSON reply.
export async function callClaudeJSON({ system, userContent, maxTokens = 4000 }) {
  const data = await postChat({ system, userContent, maxTokens });
  return cleanAndParseJson(rawTextOf(data), data.stop_reason);
}

// POST a prompt and return the model's plain-text reply (null if empty).
export async function callClaudeText({ system, userContent, maxTokens = 300 }) {
  const data = await postChat({ system, userContent, maxTokens });
  return rawTextOf(data) || null;
}
