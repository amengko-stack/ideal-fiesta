import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getWeekBounds,
  sessionSRPE,
  calculateMetrics,
  getACWRContext,
  parsePlist,
  parsePlistNode,
} from "../utils.js";

// Fixed "now" = Wednesday 2024-01-10 00:00:00 UTC
const FIXED_NOW = new Date("2024-01-10T00:00:00.000Z");

// ─── getWeekBounds ────────────────────────────────────────────────────────────
describe("getWeekBounds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("returns the current week (Monday–Sunday) for weeksAgo=0", () => {
    expect(getWeekBounds(0)).toEqual({ start: "2024-01-08", end: "2024-01-15" });
  });

  it("returns the previous week for weeksAgo=1", () => {
    expect(getWeekBounds(1)).toEqual({ start: "2024-01-01", end: "2024-01-08" });
  });

  it("returns 2 weeks ago for weeksAgo=2", () => {
    expect(getWeekBounds(2)).toEqual({ start: "2023-12-25", end: "2024-01-01" });
  });

  it("returns 3 weeks ago for weeksAgo=3", () => {
    expect(getWeekBounds(3)).toEqual({ start: "2023-12-18", end: "2023-12-25" });
  });

  it("end is always exactly 7 days after start", () => {
    for (let w = 0; w < 4; w++) {
      const { start, end } = getWeekBounds(w);
      const diff = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24);
      expect(diff).toBe(7);
    }
  });

  it("start is always a Monday (getDay() === 1)", () => {
    for (let w = 0; w < 4; w++) {
      const { start } = getWeekBounds(w);
      expect(new Date(start).getDay()).toBe(1);
    }
  });

  it("handles Sunday as input day (daysToMonday = 6)", () => {
    vi.setSystemTime(new Date("2024-01-14T00:00:00.000Z")); // Sunday
    expect(getWeekBounds(0)).toEqual({ start: "2024-01-08", end: "2024-01-15" });
  });

  it("handles Monday as input day (daysToMonday = 0)", () => {
    vi.setSystemTime(new Date("2024-01-08T00:00:00.000Z")); // Monday
    expect(getWeekBounds(0)).toEqual({ start: "2024-01-08", end: "2024-01-15" });
  });
});

// ─── sessionSRPE ─────────────────────────────────────────────────────────────
describe("sessionSRPE", () => {
  it("uses explicit rpe × duration for normal types", () => {
    expect(sessionSRPE({ rpe: 7, duration: 60, type: "tennis" })).toBe(420);
  });

  it("applies 0.6 multiplier for type='other'", () => {
    expect(sessionSRPE({ rpe: 10, duration: 60, type: "other" })).toBe(360);
  });

  it("derives rpe from intensity when rpe is absent", () => {
    // rpe = intensity * 2 = 6, duration = 90
    expect(sessionSRPE({ intensity: 3, duration: 90 })).toBe(540);
  });

  it("defaults rpe to 5 when neither rpe nor intensity present", () => {
    expect(sessionSRPE({ duration: 60 })).toBe(300);
  });

  it("defaults duration to 60 when absent", () => {
    expect(sessionSRPE({ rpe: 8 })).toBe(480);
  });

  it("defaults both rpe and duration when both absent", () => {
    expect(sessionSRPE({})).toBe(300); // 5 * 60 * 1.0
  });

  it("prefers rpe over intensity when both present", () => {
    expect(sessionSRPE({ rpe: 6, intensity: 9, duration: 60 })).toBe(360);
  });
});

// ─── calculateMetrics ────────────────────────────────────────────────────────
describe("calculateMetrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("returns zero SRPE and null ACWR with no logs", () => {
    const m = calculateMetrics([], []);
    expect(m.thisWeekSRPE).toBe(0);
    expect(m.acwr).toBeNull();
    expect(m.fourWeekAvg).toBe(0);
  });

  it("counts only this-week logs in thisWeekSRPE", () => {
    const logs = [
      { date: "2024-01-09", rpe: 6, duration: 60 }, // this week (Mon–Sun: 01-08 to 01-14)
      { date: "2024-01-01", rpe: 8, duration: 60 }, // last week — excluded from thisWeek
    ];
    const m = calculateMetrics(logs, []);
    expect(m.thisWeekSRPE).toBe(360); // 6 * 60
  });

  it("computes ACWR from four-week totals", () => {
    // Each week has the same load so ACWR = 1.0
    const logs = [
      { date: "2024-01-09", rpe: 6, duration: 60 }, // week 0
      { date: "2024-01-02", rpe: 6, duration: 60 }, // week 1
      { date: "2023-12-26", rpe: 6, duration: 60 }, // week 2
      { date: "2023-12-19", rpe: 6, duration: 60 }, // week 3
    ];
    const m = calculateMetrics(logs, []);
    expect(m.acwr).toBe(1);
  });

  it("rounds ACWR to two decimal places", () => {
    const logs = [
      { date: "2024-01-09", rpe: 8, duration: 60 }, // thisWeek = 480
      { date: "2024-01-02", rpe: 6, duration: 60 }, // 360
      { date: "2023-12-26", rpe: 6, duration: 60 }, // 360
      { date: "2023-12-19", rpe: 6, duration: 60 }, // 360
    ];
    // fourWeekAvg = (480+360+360+360)/4 = 390
    // acwr = 480/390 = 1.23...  → rounded to 1.23
    const m = calculateMetrics(logs, []);
    expect(m.acwr).toBe(1.23);
  });

  it("computes wellbeing averages from last 7 days", () => {
    const sevenDaysAgoDate = "2024-01-03"; // 2024-01-10 minus 7 days
    const wellbeing = [
      { date: "2024-01-09", sleep: 7, mood: 8, soreness: 3 },
      { date: "2024-01-08", sleep: 8, mood: 7, soreness: 2 },
      { date: "2024-01-02", sleep: 5, mood: 5, soreness: 5 }, // older than 7 days — excluded
    ];
    const m = calculateMetrics([], wellbeing);
    expect(m.avgSleep).toBe("7.5");
    expect(m.avgMood).toBe("7.5");
    expect(m.avgSoreness).toBe("2.5");
    expect(m.wellbeingDays).toBe(2);
  });

  it("deduplicates wellbeing by date, keeping the later time entry", () => {
    const wellbeing = [
      { date: "2024-01-09", time: "08:00", sleep: 6 },
      { date: "2024-01-09", time: "20:00", sleep: 9 }, // later — should win
    ];
    const m = calculateMetrics([], wellbeing);
    expect(m.avgSleep).toBe("9.0");
    expect(m.wellbeingDays).toBe(1);
  });

  it("returns null averages when no wellbeing data in range", () => {
    const m = calculateMetrics([], [{ date: "2024-01-01", sleep: 8 }]);
    expect(m.avgSleep).toBeNull();
    expect(m.wellbeingDays).toBe(0);
  });

  it("handles null logs and wellbeing gracefully", () => {
    const m = calculateMetrics(null, null);
    expect(m.thisWeekSRPE).toBe(0);
    expect(m.acwr).toBeNull();
  });
});

// ─── getACWRContext ───────────────────────────────────────────────────────────
describe("getACWRContext", () => {
  it("returns 'Not enough load history' when acwr is null", () => {
    const notes = getACWRContext(null, null, null);
    expect(notes.some(n => n.includes("Not enough load history"))).toBe(true);
  });

  it("returns DANGER ZONE when acwr > 1.5", () => {
    const notes = getACWRContext(1.6, null, null);
    expect(notes.some(n => n.includes("DANGER ZONE"))).toBe(true);
  });

  it("returns CAUTION when acwr is between 1.3 and 1.5 (exclusive)", () => {
    const notes = getACWRContext(1.4, null, null);
    expect(notes.some(n => n.includes("CAUTION"))).toBe(true);
  });

  it("returns OPTIMAL when acwr is in the 0.8–1.3 range", () => {
    const notes = getACWRContext(1.0, null, null);
    expect(notes.some(n => n.includes("OPTIMAL"))).toBe(true);
  });

  it("returns UNDERLOADED when acwr < 0.8", () => {
    const notes = getACWRContext(0.7, null, null);
    expect(notes.some(n => n.includes("UNDERLOADED"))).toBe(true);
  });

  it("boundary: acwr = 1.3 is OPTIMAL not CAUTION", () => {
    const notes = getACWRContext(1.3, null, null);
    expect(notes.some(n => n.includes("OPTIMAL"))).toBe(true);
    expect(notes.some(n => n.includes("CAUTION"))).toBe(false);
  });

  it("adds pre-tournament note", () => {
    const notes = getACWRContext(1.0, "pre", null);
    expect(notes.some(n => n.includes("Pre-tournament"))).toBe(true);
  });

  it("adds week_of tournament note", () => {
    const notes = getACWRContext(1.0, "week_of", null);
    expect(notes.some(n => n.includes("Tournament THIS week"))).toBe(true);
  });

  it("adds post_hard recovery note", () => {
    const notes = getACWRContext(1.0, "post_hard", null);
    expect(notes.some(n => n.includes("Post heavy tournament"))).toBe(true);
  });

  it("adds post_easy note", () => {
    const notes = getACWRContext(1.0, "post_easy", null);
    expect(notes.some(n => n.includes("Post light tournament"))).toBe(true);
  });

  it("adds morning session note when hour < 10", () => {
    const notes = getACWRContext(1.0, null, "09:30");
    expect(notes.some(n => n.includes("Morning session"))).toBe(true);
  });

  it("does not add morning note when hour = 10", () => {
    const notes = getACWRContext(1.0, null, "10:00");
    expect(notes.some(n => n.includes("Morning session"))).toBe(false);
  });

  it("adds evening session note when hour >= 19", () => {
    const notes = getACWRContext(1.0, null, "19:00");
    expect(notes.some(n => n.includes("Evening session"))).toBe(true);
  });

  it("does not add evening note when hour = 18", () => {
    const notes = getACWRContext(1.0, null, "18:59");
    expect(notes.some(n => n.includes("Evening session"))).toBe(false);
  });

  it("stacks tournament and acwr notes together", () => {
    const notes = getACWRContext(1.6, "pre", null);
    expect(notes.length).toBe(2);
    expect(notes.some(n => n.includes("Pre-tournament"))).toBe(true);
    expect(notes.some(n => n.includes("DANGER ZONE"))).toBe(true);
  });

  it("returns empty array when no sessionTime provided", () => {
    const notes = getACWRContext(1.0, null, null);
    expect(notes.some(n => n.includes("session"))).toBe(false);
  });
});

// ─── parsePlist ───────────────────────────────────────────────────────────────
describe("parsePlist", () => {
  it("throws 'binary-plist' for binary plist input", () => {
    expect(() => parsePlist("bplist00...")).toThrow("binary-plist");
  });

  it("throws 'no-plist-element' when XML has no <plist> tag", () => {
    expect(() => parsePlist("<root><dict></dict></root>")).toThrow("no-plist-element");
  });

  it("throws 'empty-plist' when plist has no child elements", () => {
    expect(() => parsePlist("<plist version='1.0'></plist>")).toThrow("empty-plist");
  });

  it("parses a simple dict with string values", () => {
    const xml = `<?xml version="1.0"?>
<plist version="1.0">
<dict>
  <key>name</key><string>Alice</string>
  <key>sport</key><string>tennis</string>
</dict>
</plist>`;
    expect(parsePlist(xml)).toEqual({ name: "Alice", sport: "tennis" });
  });

  it("parses integer and real values", () => {
    const xml = `<?xml version="1.0"?>
<plist version="1.0">
<dict>
  <key>age</key><integer>17</integer>
  <key>rating</key><real>4.5</real>
</dict>
</plist>`;
    const result = parsePlist(xml);
    expect(result.age).toBe(17);
    expect(result.rating).toBeCloseTo(4.5);
  });

  it("parses boolean values", () => {
    const xml = `<?xml version="1.0"?>
<plist version="1.0">
<dict>
  <key>active</key><true/>
  <key>retired</key><false/>
</dict>
</plist>`;
    const result = parsePlist(xml);
    expect(result.active).toBe(true);
    expect(result.retired).toBe(false);
  });

  it("parses date values as strings", () => {
    const xml = `<?xml version="1.0"?>
<plist version="1.0">
<dict>
  <key>matchDate</key><date>2024-01-10T10:30:00Z</date>
</dict>
</plist>`;
    expect(parsePlist(xml).matchDate).toBe("2024-01-10T10:30:00Z");
  });

  it("parses nested arrays", () => {
    const xml = `<?xml version="1.0"?>
<plist version="1.0">
<array>
  <integer>1</integer>
  <integer>2</integer>
  <integer>3</integer>
</array>
</plist>`;
    expect(parsePlist(xml)).toEqual([1, 2, 3]);
  });

  it("parses nested dict inside array", () => {
    const xml = `<?xml version="1.0"?>
<plist version="1.0">
<array>
  <dict><key>x</key><integer>10</integer></dict>
  <dict><key>x</key><integer>20</integer></dict>
</array>
</plist>`;
    expect(parsePlist(xml)).toEqual([{ x: 10 }, { x: 20 }]);
  });
});
