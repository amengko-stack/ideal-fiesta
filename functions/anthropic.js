import { rawTextOf, cleanAndParseJson } from './shared/aiJson.js';

// ─── ANTHROPIC CLIENT (SERVER SIDE) ──────────────────────────────────────────
// The functions-side twin of src/lib/ai.js. The browser posts to /api/chat (the
// `api` function in index.js) because it must never see the API key; a Cloud
// Function already runs where the key lives, so it calls the Messages API
// directly with Node 20's global fetch.
//
// Two deliberate differences from the /api/chat proxy:
//   - NO 6000-token clamp. That clamp exists to stop a *client* asking for an
//     oversized (costly) completion; the orchestrator's own prompts choose
//     their budget (SUNDAY_PLAN_MAX_TOKENS is exactly 6000 and must not be
//     silently trimmed by a Math.min that also caps at 6000).
//   - The model is per-call, not hard-coded: Sonnet for the plan, Haiku for the
//     small memory/digest calls.
//
// JSON extraction is the SAME code the client runs — shared/aiJson.js — so a
// preamble, a code fence or a control character inside a string is handled
// identically on both sides, and stop_reason 'max_tokens' still produces the
// "response was truncated" error rather than a generic parse failure.

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// The client (ai.js) has no retry at all: a human is watching and can press the
// button again. Nobody is watching a Sunday-morning scheduled run, so retry the
// failures that are purely transient — rate limits, overload and 5xx — with a
// short exponential backoff. Everything else (400 bad request, 401 bad key,
// truncated/unparseable JSON) is deterministic and fails immediately.
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;

const isRetryableStatus = (status) =>
  status === 408 || status === 409 || status === 429 || status >= 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Anthropic errors come back as { type: 'error', error: { type, message } }.
const anthropicErrorMessage = (data) =>
  data?.error?.message || (typeof data?.error === 'string' ? data.error : null);

// ── callAnthropicRaw ─────────────────────────────────────────────────────────
// One Messages API round trip. Returns the whole response body, because the
// JSON path needs `stop_reason` as well as the text.
async function callAnthropicRaw({ model, system, userContent, maxTokens = 4000 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set — put it in functions/.env or the Firebase console, then redeploy.'
    );
  }
  if (!model) throw new Error('callAnthropic: `model` is required');

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
    } catch (err) {
      // Network-level failure (DNS, socket, timeout) — always transient.
      lastError = new Error(`Anthropic request failed (${model}): ${err.message}`);
      if (attempt === MAX_ATTEMPTS) throw lastError;
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      continue;
    }

    let data = null;
    let parseError = null;
    try {
      data = await response.json();
    } catch (err) {
      parseError = err;
    }

    if (!response.ok || data?.type === 'error' || data?.error) {
      const detail = anthropicErrorMessage(data) || parseError?.message || 'no error body';
      const message = `Anthropic API error ${response.status} (${model}): ${detail}`;
      if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
        lastError = new Error(message);
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(message);
    }

    if (parseError) {
      throw new Error(
        `Anthropic API returned an unreadable body (${response.status}, ${model}): ${parseError.message}`
      );
    }

    return data;
  }

  // Unreachable: the loop either returns or throws on its last attempt.
  throw lastError ?? new Error(`Anthropic request failed (${model})`);
}

// ── callAnthropic ────────────────────────────────────────────────────────────
// The model's plain-text reply (trimmed, "" when the reply was empty).
export async function callAnthropic({ model, system, userContent, maxTokens = 4000 }) {
  const data = await callAnthropicRaw({ model, system, userContent, maxTokens });
  return rawTextOf(data);
}

// ── callAnthropicJSON ────────────────────────────────────────────────────────
// The model's reply parsed as a JSON object, using the same extractor the
// browser uses. `stop_reason` is passed through so a run out of tokens reports
// "truncated — max_tokens too low" instead of "not valid JSON".
export async function callAnthropicJSON({ model, system, userContent, maxTokens = 4000 }) {
  const data = await callAnthropicRaw({ model, system, userContent, maxTokens });
  return cleanAndParseJson(rawTextOf(data), data.stop_reason);
}
