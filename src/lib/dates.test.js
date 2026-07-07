import { describe, it, expect } from "vitest";
import { toLocalDateStr, getWeekBounds, currentWeekKey } from "./dates.js";

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
