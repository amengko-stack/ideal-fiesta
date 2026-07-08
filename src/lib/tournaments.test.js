import { describe, it, expect } from "vitest";
import { daysUntil, tournamentModeFor, nearestUpcoming } from "./tournaments.js";

describe("daysUntil", () => {
  it("counts calendar days", () => {
    expect(daysUntil("2026-07-08", "2026-07-08")).toBe(0);
    expect(daysUntil("2026-07-09", "2026-07-08")).toBe(1);
    expect(daysUntil("2026-08-08", "2026-07-08")).toBe(31);
  });
  it("is negative for past dates", () => {
    expect(daysUntil("2026-07-01", "2026-07-08")).toBe(-7);
  });
});

describe("tournamentModeFor", () => {
  it("maps day ranges to plan modes", () => {
    expect(tournamentModeFor(0)).toBe("week_of");
    expect(tournamentModeFor(6)).toBe("week_of");
    expect(tournamentModeFor(7)).toBe("pre");
    expect(tournamentModeFor(13)).toBe("pre");
    expect(tournamentModeFor(14)).toBe("normal");
  });
  it("defaults to normal when no tournament", () => {
    expect(tournamentModeFor(null)).toBe("normal");
    expect(tournamentModeFor(undefined)).toBe("normal");
  });
});

describe("nearestUpcoming", () => {
  const T = (name, date) => ({ name, date, level: "Club" });
  it("picks the earliest today-or-future tournament", () => {
    const list = [T("far", "2026-09-01"), T("near", "2026-07-10"), T("past", "2026-07-01")];
    expect(nearestUpcoming(list, "2026-07-08").name).toBe("near");
  });
  it("includes a tournament happening today", () => {
    expect(nearestUpcoming([T("today", "2026-07-08")], "2026-07-08").name).toBe("today");
  });
  it("returns null when empty or all past", () => {
    expect(nearestUpcoming([], "2026-07-08")).toBeNull();
    expect(nearestUpcoming([T("past", "2026-07-01")], "2026-07-08")).toBeNull();
  });
});
