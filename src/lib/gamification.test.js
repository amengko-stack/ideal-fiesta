import { describe, it, expect } from "vitest";
import { xpForSession, levelFromXp, XP, XP_PER_LEVEL } from "./gamification.js";

describe("xpForSession", () => {
  it("awards srpe/8 rounded", () => {
    expect(xpForSession(80)).toBe(10);
    expect(xpForSession(660)).toBe(83);
  });
  it("floors at 5 XP", () => {
    expect(xpForSession(0)).toBe(5);
    expect(xpForSession(24)).toBe(5);
  });
});

describe("XP constants", () => {
  it("matches the design handoff values", () => {
    expect(XP).toEqual({ CHECKIN: 10, PLAN_GENERATE: 20, STROKE_UPDATE: 10, BENCHMARK: 15 });
    expect(XP_PER_LEVEL).toBe(1000);
  });
});

describe("levelFromXp", () => {
  it("starts at level 1 Rookie", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, title: "Rookie 🌱", intoLevel: 0, toNext: 1000 });
  });
  it("tracks progress within a level", () => {
    const r = levelFromXp(640);
    expect(r.level).toBe(1);
    expect(r.intoLevel).toBe(640);
    expect(r.toNext).toBe(360);
  });
  it("levels up every 1000 XP", () => {
    expect(levelFromXp(1000).level).toBe(2);
    expect(levelFromXp(4500).level).toBe(5);
    expect(levelFromXp(4500).title).toBe("Rising Star ⭐");
  });
  it("clamps the title at Legend for level 10+", () => {
    expect(levelFromXp(9500).title).toBe("Legend 👑");
    expect(levelFromXp(25000).title).toBe("Legend 👑");
  });
  it("treats negative/undefined xp as 0", () => {
    expect(levelFromXp(-50).level).toBe(1);
    expect(levelFromXp(undefined).level).toBe(1);
  });
});
