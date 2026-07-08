import { describe, it, expect } from "vitest";
import { BADGES, evaluateBadges } from "./badges.js";

describe("BADGES", () => {
  it("defines the 8 spec badges with required fields", () => {
    expect(BADGES.map(b => b.id)).toEqual([
      "first-session", "sessions-10", "streak-5", "streak-14",
      "first-win", "checkin-7", "level-5", "plan-done",
    ]);
    for (const b of BADGES) {
      expect(b.emoji).toBeTruthy();
      expect(b.name).toBeTruthy();
      expect(b.desc).toBeTruthy();
      expect(b.hint).toBeTruthy();
    }
  });
});

describe("evaluateBadges", () => {
  it("returns nothing for empty stats", () => {
    expect(evaluateBadges({})).toEqual([]);
  });
  it("awards session badges by count", () => {
    expect(evaluateBadges({ sessionCount: 1 })).toEqual(["first-session"]);
    expect(evaluateBadges({ sessionCount: 10 })).toEqual(["first-session", "sessions-10"]);
  });
  it("awards streak tiers", () => {
    expect(evaluateBadges({ streak: 5 })).toEqual(["streak-5"]);
    expect(evaluateBadges({ streak: 14 })).toEqual(["streak-5", "streak-14"]);
  });
  it("awards win, check-in, level and plan badges", () => {
    expect(evaluateBadges({ wins: 1 })).toEqual(["first-win"]);
    expect(evaluateBadges({ checkinDays: 7 })).toEqual(["checkin-7"]);
    expect(evaluateBadges({ level: 5 })).toEqual(["level-5"]);
    expect(evaluateBadges({ planCompleted: true })).toEqual(["plan-done"]);
  });
  it("combines independent badges", () => {
    expect(evaluateBadges({ sessionCount: 12, streak: 6, wins: 2, level: 5 }))
      .toEqual(["first-session", "sessions-10", "streak-5", "first-win", "level-5"]);
  });
});
