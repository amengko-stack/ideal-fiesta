import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanAndParseJson, rawTextOf, extractJsonObject } from "./ai.js";

// The unparseable path logs the raw reply for inspection; keep test output clean.
afterEach(() => vi.restoreAllMocks());
const silenceLog = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("cleanAndParseJson", () => {
  it("parses plain JSON", () => {
    expect(cleanAndParseJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips markdown code fences", () => {
    expect(cleanAndParseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("escapes literal control characters inside string values", () => {
    expect(cleanAndParseJson('{"a":"line1\nline2"}')).toEqual({ a: "line1\nline2" });
  });
  it("reports truncation when stop_reason is max_tokens", () => {
    expect(() => cleanAndParseJson('{"a":', "max_tokens")).toThrow(/truncated/);
  });
  it("reports invalid JSON otherwise", () => {
    silenceLog();
    expect(() => cleanAndParseJson("", "end_turn")).toThrow(/not valid JSON/);
  });

  // The failure that actually broke the season report: the model wraps its
  // JSON in conversational text despite being told not to.
  it("tolerates a preamble before the JSON", () => {
    expect(cleanAndParseJson('Here is the season review:\n{"a":1}')).toEqual({ a: 1 });
  });
  it("tolerates a closing remark after the JSON", () => {
    expect(cleanAndParseJson('{"a":1}\n\nLet me know if you want more detail!')).toEqual({ a: 1 });
  });
  it("tolerates preamble, fences and a sign-off together", () => {
    expect(cleanAndParseJson('Sure!\n```json\n{"a":1}\n```\nHope that helps.')).toEqual({ a: 1 });
  });
  it("handles nested objects", () => {
    expect(cleanAndParseJson('{"a":{"b":{"c":1}},"d":2}')).toEqual({ a: { b: { c: 1 } }, d: 2 });
  });
  it("is not fooled by braces inside string values", () => {
    expect(cleanAndParseJson('{"note":"use {this} pattern","x":1}'))
      .toEqual({ note: "use {this} pattern", x: 1 });
  });
  it("is not fooled by an escaped quote before a brace", () => {
    expect(cleanAndParseJson('{"note":"say \\"hi\\" }","x":1}'))
      .toEqual({ note: 'say "hi" }', x: 1 });
  });
  it("carries a snippet of the reply so the failure is diagnosable", () => {
    silenceLog();
    expect(() => cleanAndParseJson("I can't help with that request.", "end_turn"))
      .toThrow(/began: "I can't help with that request\."/);
  });
  it("says so when the reply was empty", () => {
    silenceLog();
    expect(() => cleanAndParseJson("   ", "end_turn")).toThrow(/the reply was empty/);
  });
  it("still reports truncation when the object never closes", () => {
    expect(() => cleanAndParseJson('{"a":"unfinished', "max_tokens")).toThrow(/truncated/);
  });
});

describe("extractJsonObject", () => {
  it("returns null when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });
  it("returns null when the object never closes", () => {
    expect(extractJsonObject('{"a":1')).toBeNull();
  });
  it("returns only the first complete object", () => {
    expect(extractJsonObject('{"a":1} {"b":2}')).toBe('{"a":1}');
  });
});

describe("rawTextOf", () => {
  it("reads the first content block's text", () => {
    expect(rawTextOf({ content: [{ text: "hi" }] })).toBe("hi");
  });
  it("returns empty string when content is missing", () => {
    expect(rawTextOf({})).toBe("");
  });
});
