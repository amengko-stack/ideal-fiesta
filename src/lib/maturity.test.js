import { describe, it, expect } from "vitest";
import { maturityOffset, stageInfo } from "./maturity.js";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// Builds a {dob, date} pair whose fractional-age gap is EXACTLY `years`,
// sidestepping calendar/leap-year drift so the hand-computed expectations
// below line up with what the module computes bit-for-bit.
const agedInputs = (years, rest) => {
  const dob  = new Date("2010-01-01T00:00:00Z");
  const date = new Date(dob.getTime() + years * MS_PER_YEAR);
  return { dob, date, ...rest };
};

describe("maturityOffset", () => {
  it("matches a hand-computed Pre-PHV case (age 10, 150/75/35)", () => {
    // legLength=75; mo = -9.376 + 0.0001882*75*75 + 0.0022*10*75
    //   + 0.005841*10*75 - 0.002658*10*35 + 0.07693*(35/150)*100
    //   = -1.421892 → rounds to -1.42
    const result = maturityOffset(agedInputs(10, { heightCm: 150, sittingHeightCm: 75, weightKg: 35 }));
    expect(result.offset).toBeCloseTo(-1.42, 2);
    expect(result.stage).toBe("Pre-PHV");
  });

  it("matches a hand-computed Mid-PHV case (age 13, 160/80/48)", () => {
    // mo = -9.376 + 0.0001882*80*80 + 0.0022*13*80 + 0.005841*13*80
    //   - 0.002658*13*48 + 0.07693*(48/160)*100 = 0.840428 → rounds to 0.84
    const result = maturityOffset(agedInputs(13, { heightCm: 160, sittingHeightCm: 80, weightKg: 48 }));
    expect(result.offset).toBeCloseTo(0.84, 2);
    expect(result.stage).toBe("Mid-PHV");
  });

  it("matches a hand-computed Post-PHV case (age 16, 170/85/60)", () => {
    // mo = -9.376 + 0.0001882*85*85 + 0.0022*16*85 + 0.005841*16*85
    //   - 0.002658*16*60 + 0.07693*(60/170)*100 = 3.083021 → rounds to 3.08
    const result = maturityOffset(agedInputs(16, { heightCm: 170, sittingHeightCm: 85, weightKg: 60 }));
    expect(result.offset).toBeCloseTo(3.08, 2);
    expect(result.stage).toBe("Post-PHV");
  });

  it("computes ageAtPHV as age minus offset", () => {
    const result = maturityOffset(agedInputs(13, { heightCm: 160, sittingHeightCm: 80, weightKg: 48 }));
    expect(result.ageAtPHV).toBeCloseTo(result.age - result.offset, 2);
  });

  it("stage boundaries are < -1 Pre, -1..1 Mid, > 1 Post", () => {
    expect(maturityOffset(agedInputs(10, { heightCm: 150, sittingHeightCm: 75, weightKg: 35 })).stage).toBe("Pre-PHV"); // -1.42
    expect(maturityOffset(agedInputs(13, { heightCm: 160, sittingHeightCm: 80, weightKg: 48 })).stage).toBe("Mid-PHV"); // 0.84
    expect(maturityOffset(agedInputs(16, { heightCm: 170, sittingHeightCm: 85, weightKg: 60 })).stage).toBe("Post-PHV"); // 3.08
  });

  it("returns null when sitting height is missing", () => {
    expect(maturityOffset(agedInputs(13, { heightCm: 160, weightKg: 48 }))).toBeNull();
  });

  it("returns null when dob is missing", () => {
    expect(maturityOffset({ heightCm: 160, sittingHeightCm: 80, weightKg: 48 })).toBeNull();
  });

  it("returns null when height or weight is missing", () => {
    expect(maturityOffset(agedInputs(13, { sittingHeightCm: 80, weightKg: 48 }))).toBeNull();
    expect(maturityOffset(agedInputs(13, { heightCm: 160, sittingHeightCm: 80 }))).toBeNull();
  });

  it("returns null for missing/invalid input entirely", () => {
    expect(maturityOffset()).toBeNull();
    expect(maturityOffset({})).toBeNull();
  });
});

describe("stageInfo", () => {
  it("returns label + training implication for each stage", () => {
    expect(stageInfo("Pre-PHV")).toEqual({
      label: "Pre-PHV",
      implication: expect.stringContaining("Foundation phase"),
    });
    expect(stageInfo("Mid-PHV")).toEqual({
      label: "Mid-PHV",
      implication: expect.stringContaining("Rapid growth phase"),
    });
    expect(stageInfo("Post-PHV")).toEqual({
      label: "Post-PHV",
      implication: expect.stringContaining("Post-growth phase"),
    });
  });

  it("returns null for an unknown or missing stage", () => {
    expect(stageInfo("Unknown")).toBeNull();
    expect(stageInfo(null)).toBeNull();
    expect(stageInfo(undefined)).toBeNull();
  });
});
