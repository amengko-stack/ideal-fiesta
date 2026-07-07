import { describe, it, expect } from "vitest";
import { cleanAndParseJson, rawTextOf } from "./ai.js";

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
    expect(() => cleanAndParseJson("", "end_turn")).toThrow(/not valid JSON/);
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
