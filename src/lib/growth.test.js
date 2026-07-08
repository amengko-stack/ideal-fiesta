import { describe, it, expect } from "vitest";
import { growthVelocity } from "./growth.js";

describe("growthVelocity", () => {
  it("computes cm/yr from the last two height measurements", () => {
    const ms = [
      { date: "2025-07-08", height: 146 },
      { date: "2026-07-08", height: 152 },
    ];
    expect(growthVelocity(ms)).toBe(6);
  });
  it("uses the LAST two when more exist and sorts by date", () => {
    const ms = [
      { date: "2026-01-08", height: 149 },
      { date: "2024-07-08", height: 140 },
      { date: "2026-07-08", height: 152 },
    ];
    // Jan→Jul 2026: +3cm over ~0.4956yr ≈ 6.1
    expect(growthVelocity(ms)).toBeCloseTo(6.1, 1);
  });
  it("ignores entries without height", () => {
    const ms = [
      { date: "2025-07-08", height: 146 },
      { date: "2026-07-01", weight: 41 },
      { date: "2026-07-08", height: 152 },
    ];
    expect(growthVelocity(ms)).toBe(6);
  });
  it("returns null with fewer than two heights or a zero gap", () => {
    expect(growthVelocity([])).toBeNull();
    expect(growthVelocity([{ date: "2026-07-08", height: 152 }])).toBeNull();
    expect(growthVelocity([
      { date: "2026-07-08", height: 151 },
      { date: "2026-07-08", height: 152 },
    ])).toBeNull();
  });
});
