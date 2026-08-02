import { describe, it, expect } from "vitest";
import { friendlyAiError } from "./aiErrors.js";

describe("friendlyAiError", () => {
  // These four strings are thrown verbatim by seasonReport.js and ai.js. If a
  // thrown message is reworded there, the matching test here should fail.
  it("explains the missing-analyses guard in actionable terms", () => {
    const err = new Error("No match analyses found — generate AI analysis for at least one match first.");
    expect(friendlyAiError(err)).toBe(
      "Analyse at least one match first — the season review is built from them."
    );
  });

  it("explains a truncated reply", () => {
    expect(friendlyAiError(new Error("AI response was truncated — max_tokens too low")))
      .toBe("The AI's reply was too long to finish. Try again.");
  });

  it("explains malformed JSON", () => {
    expect(friendlyAiError(new Error("AI response was not valid JSON")))
      .toBe("The AI returned a malformed reply. Try again.");
  });

  it("points at the key and credit when the service rejects the request", () => {
    expect(friendlyAiError(new Error("AI request failed: 401")))
      .toBe("The AI service rejected the request — check the API key and its credit.");
  });

  it("explains a network failure", () => {
    expect(friendlyAiError(new TypeError("Failed to fetch")))
      .toBe("Couldn't reach the AI service — check your connection.");
  });

  it("prefers the specific cause when a message could match two rules", () => {
    // The proxy prefixes everything with "AI request failed", so a truncation
    // reported through it must still read as a truncation.
    expect(friendlyAiError(new Error("AI request failed: response was truncated")))
      .toBe("The AI's reply was too long to finish. Try again.");
  });

  it("keeps the snippet of what the model actually sent", () => {
    // ai.js appends this; without it a malformed reply can't be diagnosed.
    const err = new Error('AI response was not valid JSON (began: "Here is the season review:")');
    const out = friendlyAiError(err);
    expect(out).toContain("The AI returned a malformed reply.");
    expect(out).toContain('(began: "Here is the season review:")');
  });

  it("passes an unrecognised message through rather than hiding it", () => {
    expect(friendlyAiError(new TypeError("Cannot read properties of undefined (reading 'valissa')")))
      .toBe("Cannot read properties of undefined (reading 'valissa')");
  });

  it("caps a very long unrecognised message", () => {
    const out = friendlyAiError(new Error("x".repeat(400)));
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.endsWith("…")).toBe(true);
  });

  it("accepts a bare string", () => {
    expect(friendlyAiError("AI response was not valid JSON"))
      .toBe("The AI returned a malformed reply. Try again.");
  });

  it("never returns an empty string", () => {
    for (const input of [null, undefined, "", "   ", {}, new Error("")]) {
      expect(friendlyAiError(input).length).toBeGreaterThan(0);
    }
  });
});
