import { rawTextOf, cleanAndParseJson } from "./aiJson.js";

// ─── AI PROXY CLIENT ─────────────────────────────────────────────────────────
// In development the Express proxy runs on localhost:3001.
// In production (Firebase Hosting) /api/chat is rewritten to the Cloud Function.
//
// The JSON-extraction half lives in aiJson.js — a pure module with no
// `import.meta.env`, so a Node runtime can reuse it — and is re-exported here so
// existing importers keep working unchanged.
export { rawTextOf, extractJsonObject, escapeControlChars, beganWith, cleanAndParseJson } from "./aiJson.js";

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
