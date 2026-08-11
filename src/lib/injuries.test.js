import { describe, it, expect } from "vitest";
import {
  BODY_AREAS, SIDES, SEVERITY_LABELS,
  describeInjury, injuryDuration, openInjuries, resolvedInjuries,
  injuryLoadFlag, recurringAreas,
} from "./injuries.js";

describe("BODY_AREAS / SIDES / SEVERITY_LABELS", () => {
  it("declares a fixed, non-empty option list", () => {
    expect(BODY_AREAS.length).toBeGreaterThan(5);
    expect(BODY_AREAS).toContain("Knee");
    expect(BODY_AREAS).toContain("Other");
  });
  it("declares the four side options", () => {
    expect(SIDES).toEqual(["Left", "Right", "Both", "N/A"]);
  });
  it("has a label for every severity 1-5", () => {
    for (let s = 1; s <= 5; s++) expect(typeof SEVERITY_LABELS[s]).toBe("string");
  });
});

describe("injuryDuration", () => {
  it("counts days from onset to today while open", () => {
    const injury = { status: "open", onsetDate: "2026-07-28" };
    expect(injuryDuration(injury, new Date("2026-08-03T12:00:00"))).toBe(6);
  });
  it("counts days from onset to resolvedDate while resolved", () => {
    const injury = { status: "resolved", onsetDate: "2026-07-01", resolvedDate: "2026-07-10" };
    expect(injuryDuration(injury)).toBe(9);
  });
  it("returns null with no onset date", () => {
    expect(injuryDuration({ status: "open" })).toBeNull();
  });
  it("returns null with a malformed onset date", () => {
    expect(injuryDuration({ status: "open", onsetDate: "not-a-date" })).toBeNull();
  });
  it("returns null instead of NaN for missing injury", () => {
    expect(injuryDuration(null)).toBeNull();
  });
  it("falls back to today when resolved but resolvedDate is missing/invalid", () => {
    const injury = { status: "resolved", onsetDate: "2026-07-28" };
    expect(injuryDuration(injury, new Date("2026-08-03T12:00:00"))).toBe(6);
  });
});

describe("describeInjury", () => {
  it("formats side, area, severity word and duration", () => {
    const injury = { bodyArea: "Knee", side: "Left", severity: 2, status: "open", onsetDate: "2026-07-28" };
    expect(describeInjury(injury, new Date("2026-08-03T12:00:00"))).toBe("Left Knee · mild (2/5) · 6 days");
  });
  it("omits side when N/A", () => {
    const injury = { bodyArea: "Lower back", side: "N/A", severity: 1, status: "open", onsetDate: "2026-08-02" };
    expect(describeInjury(injury)).toContain("Lower back ·");
  });
  it("labels severity 1 as niggle and 4-5 as severe", () => {
    expect(describeInjury({ bodyArea: "Ankle", severity: 1, status: "open" })).toContain("niggle");
    expect(describeInjury({ bodyArea: "Ankle", severity: 5, status: "open" })).toContain("severe");
  });
});

describe("openInjuries / resolvedInjuries", () => {
  const list = [
    { id: "a", bodyArea: "Knee", severity: 2, status: "open", onsetDate: "2026-07-01" },
    { id: "b", bodyArea: "Ankle", severity: 4, status: "open", onsetDate: "2026-07-20" },
    { id: "c", bodyArea: "Wrist", severity: 4, status: "open", onsetDate: "2026-07-25" },
    { id: "d", bodyArea: "Shin", severity: 1, status: "resolved", resolvedDate: "2026-06-01" },
    { id: "e", bodyArea: "Hip/Groin", severity: 2, status: "resolved", resolvedDate: "2026-07-01" },
  ];
  it("filters to open, sorted by severity desc then most recent onset", () => {
    const open = openInjuries(list);
    expect(open.map(i => i.id)).toEqual(["c", "b", "a"]);
  });
  it("filters to resolved, sorted by most recently resolved first", () => {
    const resolved = resolvedInjuries(list);
    expect(resolved.map(i => i.id)).toEqual(["e", "d"]);
  });
  it("returns empty arrays for empty/missing input", () => {
    expect(openInjuries([])).toEqual([]);
    expect(openInjuries(undefined)).toEqual([]);
    expect(resolvedInjuries(undefined)).toEqual([]);
  });
});

describe("injuryLoadFlag", () => {
  it("returns null when nothing is open", () => {
    const list = [{ bodyArea: "Knee", severity: 3, status: "resolved", resolvedDate: "2026-07-01" }];
    expect(injuryLoadFlag(list)).toBeNull();
  });
  it("returns null for an empty list", () => {
    expect(injuryLoadFlag([])).toBeNull();
  });
  it("escalates to danger for severity >= 4", () => {
    const list = [{ bodyArea: "Shoulder", severity: 4, status: "open", onsetDate: "2026-07-28" }];
    const flag = injuryLoadFlag(list);
    expect(flag.tone).toBe("danger");
    expect(flag.headline).toContain("Shoulder");
    expect(flag.guidance).toMatch(/medical/i);
  });
  it("warns for severity 3 with no severity 4/5 present", () => {
    const list = [{ bodyArea: "Hip/Groin", severity: 3, status: "open", onsetDate: "2026-07-28" }];
    const flag = injuryLoadFlag(list);
    expect(flag.tone).toBe("warn");
    expect(flag.guidance).toMatch(/avoid loading/i);
  });
  it("is info-only for severity 1-2", () => {
    const list = [{ bodyArea: "Ankle", severity: 1, status: "open", onsetDate: "2026-07-28" }];
    const flag = injuryLoadFlag(list);
    expect(flag.tone).toBe("info");
    expect(flag.guidance).toMatch(/monitor/i);
  });
  it("takes the highest severity among multiple open injuries and lists all affected areas", () => {
    const list = [
      { bodyArea: "Ankle", severity: 1, status: "open", onsetDate: "2026-07-28" },
      { bodyArea: "Wrist", severity: 4, status: "open", onsetDate: "2026-07-29" },
    ];
    const flag = injuryLoadFlag(list);
    expect(flag.tone).toBe("danger");
    expect(flag.headline).toContain("Ankle");
    expect(flag.headline).toContain("Wrist");
  });
});

describe("recurringAreas", () => {
  // Pinned so the fixtures below stay inside the lookback window forever. With
  // the real clock these pass today and start failing months from now, on a day
  // nobody touched this file.
  const REF = new Date("2026-08-03T12:00:00");

  it("flags a body area injured 2+ times within the window", () => {
    const list = [
      { bodyArea: "Knee", onsetDate: "2026-06-01" },
      { bodyArea: "Knee", onsetDate: "2026-07-15" },
      { bodyArea: "Ankle", onsetDate: "2026-07-20" },
    ];
    const rec = recurringAreas(list, { withinDays: 180, ref: REF });
    expect(rec).toEqual([{ bodyArea: "Knee", count: 2, mostRecentOnset: "2026-07-15" }]);
  });
  it("excludes injuries outside the window", () => {
    const list = [
      { bodyArea: "Knee", onsetDate: "2025-01-01" },
      { bodyArea: "Knee", onsetDate: "2025-01-15" },
    ];
    expect(recurringAreas(list, { withinDays: 180, ref: REF })).toEqual([]);
  });
  it("respects a custom minCount", () => {
    const list = [
      { bodyArea: "Knee", onsetDate: "2026-07-01" },
      { bodyArea: "Knee", onsetDate: "2026-07-10" },
      { bodyArea: "Knee", onsetDate: "2026-07-20" },
    ];
    expect(recurringAreas(list, { minCount: 3, ref: REF })).toEqual([{ bodyArea: "Knee", count: 3, mostRecentOnset: "2026-07-20" }]);
    expect(recurringAreas(list, { minCount: 4, ref: REF })).toEqual([]);
  });
  it("sorts multiple recurring areas newest onset first", () => {
    const list = [
      { bodyArea: "Knee", onsetDate: "2026-05-01" },
      { bodyArea: "Knee", onsetDate: "2026-05-10" },
      { bodyArea: "Ankle", onsetDate: "2026-07-01" },
      { bodyArea: "Ankle", onsetDate: "2026-07-05" },
    ];
    const rec = recurringAreas(list, { ref: REF });
    expect(rec.map(r => r.bodyArea)).toEqual(["Ankle", "Knee"]);
  });
  it("ignores entries with malformed or missing onset dates", () => {
    const list = [
      { bodyArea: "Knee", onsetDate: "bad-date" },
      { bodyArea: "Knee" },
    ];
    expect(recurringAreas(list)).toEqual([]);
  });
  it("returns empty for empty/missing input", () => {
    expect(recurringAreas([])).toEqual([]);
    expect(recurringAreas(undefined)).toEqual([]);
  });
});
