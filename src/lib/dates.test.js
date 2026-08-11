import { describe, it, expect } from "vitest";
import { toLocalDateStr, getWeekBounds, currentWeekKey, weekStartOf, previousWeekKey, isDigestFresh } from "./dates.js";

describe("toLocalDateStr", () => {
  it("formats local date parts as YYYY-MM-DD", () => {
    expect(toLocalDateStr(new Date(2026, 6, 7))).toBe("2026-07-07");
  });
  it("pads month and day", () => {
    expect(toLocalDateStr(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
  it("does not roll the day back for late-evening local times", () => {
    // toISOString() would shift this date in UTC+ timezones — the bug class fixed in review
    expect(toLocalDateStr(new Date(2026, 6, 6, 23, 30))).toBe("2026-07-06");
  });
});

describe("getWeekBounds", () => {
  it("returns a Monday-anchored 7-day window (end exclusive)", () => {
    const { start, end } = getWeekBounds(0);
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T00:00:00`);
    expect(s.getDay()).toBe(1); // Monday
    expect((e - s) / 86400000).toBe(7);
  });
  it("weeksAgo=1 window ends exactly where weeksAgo=0 starts", () => {
    expect(getWeekBounds(1).end).toBe(getWeekBounds(0).start);
  });
});

describe("currentWeekKey", () => {
  it("equals this week's Monday (consistent with getWeekBounds)", () => {
    expect(currentWeekKey()).toBe(getWeekBounds(0).start);
  });
});

describe("weekStartOf", () => {
  it("maps a mid-week date to its Monday", () => {
    expect(weekStartOf("2026-07-08")).toBe("2026-07-06"); // Wed → Mon
  });
  it("maps Sunday to the preceding Monday", () => {
    expect(weekStartOf("2026-07-12")).toBe("2026-07-06");
  });
  it("maps Monday to itself", () => {
    expect(weekStartOf("2026-07-06")).toBe("2026-07-06");
  });
});

describe("previousWeekKey", () => {
  it("steps back exactly one Monday", () => {
    expect(previousWeekKey("2026-07-06")).toBe("2026-06-29");
  });
  it("crosses a month boundary", () => {
    expect(previousWeekKey("2026-08-03")).toBe("2026-07-27");
  });
  it("crosses a DST-style year boundary without drifting", () => {
    expect(previousWeekKey("2026-01-05")).toBe("2025-12-29");
  });
  it("returns null for missing or unparseable input", () => {
    expect(previousWeekKey(null)).toBe(null);
    expect(previousWeekKey("not-a-date")).toBe(null);
  });
});

describe("isDigestFresh", () => {
  // Wednesday 2026-07-08 → this week's Monday is 2026-07-06.
  const wed = new Date(2026, 6, 8, 9, 0);

  it("accepts the current week", () => {
    expect(isDigestFresh("2026-07-06", wed)).toBe(true);
  });
  it("accepts last week — Sunday morning's digest is still the newest one on Monday", () => {
    expect(isDigestFresh("2026-06-29", wed)).toBe(true);
  });
  it("rejects a two-week-old digest", () => {
    expect(isDigestFresh("2026-06-22", wed)).toBe(false);
  });
  it("rejects a future week", () => {
    expect(isDigestFresh("2026-07-13", wed)).toBe(false);
  });
  it("rejects a missing weekKey", () => {
    expect(isDigestFresh(null, wed)).toBe(false);
    expect(isDigestFresh(undefined, wed)).toBe(false);
  });
  it("still counts the previous week late on a Sunday, before the new run", () => {
    const sun = new Date(2026, 6, 12, 17, 0); // Sunday of the 2026-07-06 week
    expect(isDigestFresh("2026-06-29", sun)).toBe(true);
    expect(isDigestFresh("2026-07-06", sun)).toBe(true);
  });
});
