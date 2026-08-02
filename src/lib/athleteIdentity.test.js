import { describe, it, expect } from "vitest";
import {
  AGE_CATEGORIES, categoryLabel, categoryCutoff, computeAge,
  chronologicalCategory, playingUpYears, resolveIdentity,
  identityChipText, identityBlock, shoutoutSystemPrompt,
} from "./athleteIdentity.js";

// Fixed "now" so these never drift with the real clock.
const NOW = new Date("2026-08-02T12:00:00");

describe("computeAge", () => {
  it("returns whole years, birthday-correct", () => {
    expect(computeAge("2014-01-01", NOW)).toBe(12);
    expect(computeAge("2013-12-31", NOW)).toBe(12);
  });

  it("does not count the birthday until it has passed", () => {
    // Birthday tomorrow → still 11.
    expect(computeAge("2014-08-03", NOW)).toBe(11);
    // Birthday today → 12.
    expect(computeAge("2014-08-02", NOW)).toBe(12);
    // Birthday yesterday → 12.
    expect(computeAge("2014-08-01", NOW)).toBe(12);
  });

  it("parses date-only strings as local midnight, not UTC", () => {
    // A UTC parse of "2014-08-02" reads as 2014-08-01 in negative-offset zones,
    // which would report 11 here instead of 12.
    expect(computeAge("2014-08-02", new Date("2026-08-02T00:30:00"))).toBe(12);
  });

  it("accepts a Date and returns null for missing or unparseable input", () => {
    expect(computeAge(new Date("2014-01-01T00:00:00"), NOW)).toBe(12);
    expect(computeAge(null, NOW)).toBeNull();
    expect(computeAge("", NOW)).toBeNull();
    expect(computeAge("not-a-date", NOW)).toBeNull();
  });
});

describe("categories", () => {
  it("exposes cutoffs and labels", () => {
    expect(categoryCutoff("U14")).toBe(14);
    expect(categoryCutoff("Open")).toBeNull();
    expect(categoryCutoff("nonsense")).toBeNull();
    expect(categoryLabel("U14")).toBe("Under-14");
  });

  it("maps an age to the smallest bracket that admits her", () => {
    expect(chronologicalCategory(9)).toBe("U10");
    expect(chronologicalCategory(12)).toBe("U12");
    expect(chronologicalCategory(13)).toBe("U14");
    expect(chronologicalCategory(19)).toBe("Open");
    expect(chronologicalCategory(null)).toBeNull();
  });

  it("every category id is unique", () => {
    const ids = AGE_CATEGORIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("playingUpYears", () => {
  it("is 2 for a 12-year-old in U14 — the case that prompted this work", () => {
    expect(playingUpYears(12, "U14")).toBe(2);
  });

  it("collapses to 0 once she ages into the division", () => {
    expect(playingUpYears(13, "U14")).toBe(0);
    expect(playingUpYears(14, "U14")).toBe(0);
  });

  it("never reports playing down as a negative", () => {
    expect(playingUpYears(13, "U12")).toBe(0);
  });

  it("is 0 when age or category is unknown", () => {
    expect(playingUpYears(null, "U14")).toBe(0);
    expect(playingUpYears(12, "Open")).toBe(0);
    expect(playingUpYears(12, undefined)).toBe(0);
  });
});

describe("resolveIdentity", () => {
  const valissa = { name: "Valissa", dob: "2014-01-01", competitionCategory: "U14" };

  it("resolves the real case", () => {
    const id = resolveIdentity(valissa, NOW);
    expect(id).toMatchObject({
      firstName: "Valissa", age: 12, category: "U14",
      categoryLabel: "Under-14", playingUp: 2, isPlayingUp: true,
      yearsOlderOpponents: 2,
    });
  });

  it("falls back to her chronological division, never to a guess", () => {
    const id = resolveIdentity({ name: "Valissa", dob: "2014-01-01" }, NOW);
    expect(id.category).toBe("U12");
    expect(id.isPlayingUp).toBe(false);
  });

  it("survives an empty profile", () => {
    const id = resolveIdentity(null, NOW);
    expect(id.name).toBe("Valissa");
    expect(id.age).toBeNull();
    expect(id.isPlayingUp).toBe(false);
  });
});

describe("identityBlock", () => {
  const valissa = { name: "Valissa", dob: "2014-01-01", competitionCategory: "U14" };

  it("states the division and the playing-up framing", () => {
    const block = identityBlock(valissa, NOW);
    expect(block).toContain("age 12");
    expect(block).toContain("Under-14");
    expect(block).toContain("PLAYING UP by 2 years");
    expect(block).toContain("up to 2 years older");
    expect(block).toContain("out-hit rather than out-played");
  });

  it("never says under-12 for an athlete competing in U14", () => {
    expect(identityBlock(valissa, NOW)).not.toMatch(/Under-12|U12/);
  });

  it("collapses the playing-up guidance once she is at level", () => {
    const older = { ...valissa, dob: "2012-01-01" };  // 14 in U14
    const block = identityBlock(older, NOW);
    expect(block).toContain("her own age division");
    expect(block).not.toContain("PLAYING UP");
  });
});

describe("identityChipText", () => {
  it("renders age, division and the playing-up marker", () => {
    expect(identityChipText({ dob: "2014-01-01", competitionCategory: "U14" }, NOW))
      .toBe("Age 12 · Under-14 · playing up 2");
  });

  it("drops the marker at level and the age when dob is unset", () => {
    expect(identityChipText({ dob: "2012-01-01", competitionCategory: "U14" }, NOW))
      .toBe("Age 14 · Under-14");
    expect(identityChipText({ competitionCategory: "U14" }, NOW)).toBe("Under-14");
  });
});

describe("shoutoutSystemPrompt", () => {
  const valissa = { name: "Valissa", dob: "2014-01-01", competitionCategory: "U14" };

  it("uses the derived age and division, not a hardcoded 12", () => {
    const p = shoutoutSystemPrompt(valissa, [], NOW);
    expect(p).toContain("12-year-old");
    expect(p).toContain("Under-14");
    expect(p).toContain("playing up 2 years");
  });

  it("lists recent messages so the no-repeat instruction is followable", () => {
    const p = shoutoutSystemPrompt(valissa, ["Great work today!", "Big effort."], NOW);
    expect(p).toContain("do NOT reuse their phrasing");
    expect(p).toContain("Great work today!");
  });

  it("caps the recent list at five", () => {
    const recent = Array.from({ length: 9 }, (_, i) => `msg-${i}`);
    const p = shoutoutSystemPrompt(valissa, recent, NOW);
    expect(p).toContain("msg-4");
    expect(p).not.toContain("msg-5");
  });

  it("omits the avoid-list section entirely when there is no history", () => {
    expect(shoutoutSystemPrompt(valissa, [], NOW)).not.toContain("do NOT reuse");
  });
});