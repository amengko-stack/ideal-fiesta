import { describe, it, expect } from "vitest";
import { computeStreak } from "./streak.js";

const TODAY = "2026-07-08"; // a Wednesday

describe("computeStreak", () => {
  it("returns zeros for no entries", () => {
    expect(computeStreak([], TODAY)).toEqual({ current: 0, activeThisWeek: 0 });
  });
  it("counts a single entry today", () => {
    expect(computeStreak(["2026-07-08"], TODAY)).toEqual({ current: 1, activeThisWeek: 1 });
  });
  it("keeps the streak alive on yesterday's entry (grace period)", () => {
    expect(computeStreak(["2026-07-07"], TODAY).current).toBe(1);
  });
  it("is dead when the last entry was two days ago", () => {
    expect(computeStreak(["2026-07-06"], TODAY).current).toBe(0);
  });
  it("counts consecutive chains through today", () => {
    const r = computeStreak(["2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08"], TODAY);
    expect(r.current).toBe(4);
  });
  it("stops the chain at a gap", () => {
    const r = computeStreak(["2026-07-04", "2026-07-06", "2026-07-07", "2026-07-08"], TODAY);
    expect(r.current).toBe(3); // 06,07,08 — the 04 is across a gap
  });
  it("counts activeThisWeek only within the current Mon–Sun week up to today", () => {
    const r = computeStreak(["2026-07-05", "2026-07-06", "2026-07-08"], TODAY);
    expect(r.activeThisWeek).toBe(2); // Jul 5 is the previous week (Sunday)
  });
  it("deduplicates repeated dates", () => {
    const r = computeStreak(["2026-07-08", "2026-07-08"], TODAY);
    expect(r).toEqual({ current: 1, activeThisWeek: 1 });
  });
});
