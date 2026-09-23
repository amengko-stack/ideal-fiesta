import { describe, it, expect, vi, beforeEach } from "vitest";
import { maturityOffset } from "./maturity.js";
import { assembleAthleteContext } from "./athleteContextCore.js";
import { deferredPrioritySchemaBlock } from "./priorityKeys.js";

// ─── THE MODEL NEVER RECEIVES MIRWALD-DERIVED EVIDENCE ───────────────────────
//
// maturityIsolation.test.js proves the DETERMINISTIC paths — Guardian, growth,
// readiness, the S&C framework. This file covers the two AI paths, which are
// the ones that were still leaking.
//
// The leak was one line. athleteContextCore appended a maturity line to
// `identityText`:
//
//   Estimated maturity offset — interpret cautiously: Mid-PHV
//   (≈0.4 yrs past the estimated growth spurt) — <stage-derived implication>
//
// and identityText is the FIRST LINE of both the match-analysis prompt and the
// season-report prompt. Those two calls are not read-only: match analysis
// writes deferredPriorities, and the season report writes the standing season
// priority (nextMonthPriority / longTermOutlook). Both of those are read back
// into later planning. So a population regression with years of individual
// error had a path — indirect, but real — into what a 12-year-old would be
// told to work on next month.
//
// THE GOAL IS NOT "the model happens to answer the same way". It is that the
// model is never handed the evidence. So these tests capture what is actually
// sent: the real generateMatchAnalysis and generateSeasonReport run against a
// stubbed model client, and the two prompts must come back byte-identical when
// the only thing that changed is the maturity estimate.
//
// The single-variable lever is `sittingHeight`. It is an input to the Mirwald
// equation and to nothing else in this app — not identity, not load, not
// growth velocity, not division — so moving it moves the estimate and nothing
// else. `dob` would also move the estimate, but it moves age and competition
// category too, which are legitimate inputs; it is the lever used on the
// Guardian side, where nothing reads it but maturityOffset.

// ── stubs ────────────────────────────────────────────────────────────────────
// Firestore and the model are replaced; every pure module stays real.

const sent = [];

vi.mock("../firebase", () => ({ db: {}, app: {}, auth: {} }));
vi.mock("../firebase.js", () => ({ db: {}, app: {}, auth: {} }));

vi.mock("firebase/firestore", () => ({
  doc: (...path) => ({ path: path.slice(1).join("/") }),
  setDoc: async () => {},
  getDoc: async () => ({
    exists: () => true,
    data: () => ({ criticalFindings: [{ finding: "second serve sat up", priority: "important" }] }),
  }),
  collection: () => ({}),
  getDocs: async () => ({ docs: [] }),
  addDoc: async () => ({ id: "x" }),
  updateDoc: async () => {},
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  serverTimestamp: () => null,
}));

vi.mock("./ai.js", () => ({
  callClaudeJSON: async ({ system, userContent }) => {
    sent.push({ system, userContent });
    // A minimal well-formed answer for each caller, so the pipeline runs to
    // completion rather than throwing before the interesting part.
    return {
      matchSummary: "", loadContext: "", criticalFindings: [], strengthsToReinforce: [],
      rallyPatternAnalysis: "", serveAnalysis: "", shotBreakdownInsights: "",
      deferredPriorities: [], athleteNote: "", parentNote: "",
      totalMatchesAnalyzed: 1, overallRecord: "1-0", consistentWeaknesses: [],
      improvements: [], inconsistencies: [], developmentalStageAssessment: "",
      nextMonthPriority: "", longTermOutlook: "", divisionContext: "",
    };
  },
}));

// Memory writes are an enhancement both callers already wrap in try/catch.
vi.mock("./athleteMemory.js", () => ({
  updateMemoryFromMatch: async () => {},
  updateMemoryFromSeasonReport: async () => {},
  loadMemory: async () => null,
}));

vi.mock("./deferredPriorities.js", () => ({
  saveDeferredPriorities: async () => {},
  refreshEscalations: async () => {},
  resolveMetricTargets: async () => {},
}));

// buildAthleteContext is the boundary this test controls. It returns the REAL
// assembled context — assembleAthleteContext, unmocked — so what the prompt
// builders see is exactly what production hands them.
let sittingHeightUnderTest = 80;
vi.mock("./athleteContext.js", async () => {
  const { assembleAthleteContext: assemble } = await vi.importActual("./athleteContextCore.js");
  return {
    buildAthleteContext: async () => assemble(rawBundleFor(sittingHeightUnderTest), NOW),
    selectRecentMatch: () => null,
  };
});

// ── fixture ──────────────────────────────────────────────────────────────────

const NOW = new Date("2026-03-15T09:00:00.000Z");

// Everything is held fixed except the sitting height passed in.
function rawBundleFor(sittingHeight) {
  return {
    athleteUid: "a1",
    weekLogs: [
      { id: "l1", date: "2026-03-09", type: "tennis", duration: 90, rpe: 7 },
      { id: "l2", date: "2026-03-11", type: "tennis", duration: 60, rpe: 6 },
      { id: "l3", date: "2026-03-13", type: "strength", duration: 45, rpe: 5 },
    ],
    wellbeing: [{ id: "w1", date: "2026-03-14", type: "checkin", mood: 4, soreness: 2, sleep: 8 }],
    tournaments: [{ id: "t1", name: "Regional", date: "2026-04-04" }],
    profile: {
      name: "Test Athlete",
      dob: "2013-09-01",
      competitionCategory: "u14",
      height: 153,
      weight: 43,
      sittingHeight,
      measurements: [
        { date: "2026-03-01", height: 153, weight: 43, sittingHeight },
        { date: "2025-09-01", height: 149, weight: 40, sittingHeight: sittingHeight - 2 },
      ],
    },
    matches: [],
    deferredDocs: [
      { id: "d1", status: "active", priority: "Second serve depth", key: "second-serve", reason: "recurring" },
    ],
    injuries: [],
  };
}

const MATCH = {
  id: "m1",
  athleteId: "a1",
  matchStartTime: "2026-03-14T10:00:00.000Z",
  whoWonMatch: 1,
  opponentName: "Opponent",
  ageCategory: "u14",
  setScores: { p1: [6, 6], p2: [3, 4] },
  valissa: { winners: 12, unforcedErrors: 9, firstServePct: 58, doubleFaults: 3 },
  opponent: { winners: 7, unforcedErrors: 14 },
  calculated: { wueRatio: 1.33, rallyDistribution: { "0-4": { total: 30, valissaWinPct: 55 } } },
};

// Bands that the estimate must actually cross, or the comparison proves nothing.
const LOW_SITTING = 70;
const HIGH_SITTING = 88;

const MATURITY_WORDS = [
  "Pre-PHV", "Mid-PHV", "Post-PHV", "PHV", "Mirwald",
  "maturity", "maturation", "growth spurt", "maturity offset",
];

const captureFor = async (generate, sittingHeight) => {
  sent.length = 0;
  sittingHeightUnderTest = sittingHeight;
  await generate();
  expect(sent.length).toBe(1);
  return sent[0];
};

beforeEach(() => { sent.length = 0; });

// ── the fixture is not vacuous ───────────────────────────────────────────────

describe("the lever really moves the estimate", () => {
  it("produces materially different Mirwald estimates at the two sitting heights", () => {
    const at = (cm) => maturityOffset({
      dob: "2013-09-01", heightCm: 153, sittingHeightCm: cm, weightKg: 43, date: NOW,
    });
    expect(at(LOW_SITTING)).not.toBeNull();
    expect(at(HIGH_SITTING)).not.toBeNull();
    expect(Math.abs(at(HIGH_SITTING).offset - at(LOW_SITTING).offset)).toBeGreaterThan(0.5);
  });

  it("changes nothing else in the assembled context", () => {
    // The whole context object, not just the profile: if sitting height reached
    // load, growth, tournaments or priorities, this would differ.
    const a = assembleAthleteContext(rawBundleFor(LOW_SITTING), NOW);
    const b = assembleAthleteContext(rawBundleFor(HIGH_SITTING), NOW);
    // measurements are echoed verbatim in the raw bundle, so compare what the
    // context DERIVES rather than what it copies.
    expect(b.athleteProfile).toEqual(a.athleteProfile);
    expect(b.sessionLogs).toEqual(a.sessionLogs);
    expect(b.wellbeing).toEqual(a.wellbeing);
    expect(b.tournamentStatus).toEqual(a.tournamentStatus);
    expect(b.deferredPriorities).toEqual(a.deferredPriorities);
  });

  it("names no maturity band anywhere in the context, at either extreme", () => {
    for (const cm of [LOW_SITTING, 80, HIGH_SITTING]) {
      const blob = JSON.stringify(assembleAthleteContext(rawBundleFor(cm), NOW));
      for (const word of MATURITY_WORDS) {
        expect(blob, `context leaked "${word}"`).not.toContain(word);
      }
    }
  });
});

// ── match analysis ───────────────────────────────────────────────────────────

describe("match analysis — the maturity estimate is not in the prompt", () => {
  const run = async (cm) => {
    const { generateMatchAnalysis } = await import("./matchAnalysis.js");
    return captureFor(() => generateMatchAnalysis("a1", MATCH), cm);
  };

  it("sends a BYTE-IDENTICAL system and user prompt across the whole range", async () => {
    const low = await run(LOW_SITTING);
    const high = await run(HIGH_SITTING);
    expect(high.system).toBe(low.system);
    expect(high.userContent).toBe(low.userContent);
  });

  it("names no maturity band or stage implication at any estimate", async () => {
    for (const cm of [LOW_SITTING, 80, HIGH_SITTING]) {
      const { system, userContent } = await run(cm);
      for (const word of MATURITY_WORDS) {
        expect(userContent, `match prompt leaked "${word}"`).not.toContain(word);
        expect(system, `match system prompt leaked "${word}"`).not.toContain(word);
      }
    }
  });

  it("still sends the identity facts that are legitimate inputs", async () => {
    // Proving absence is only worth something if the prompt is otherwise real.
    const { userContent } = await run(80);
    expect(userContent).toContain("ATHLETE: Test Athlete");
    expect(userContent).toContain("COMPETITION DIVISION: u14");
    expect(userContent).toContain("Training load this week");
  });

  it("hands the deferred-priority machinery no maturity evidence", async () => {
    // This is the prompt section that produces deferredPriorities, which are
    // read back into later planning. It must be free of the estimate too.
    const { userContent } = await run(80);
    const section = userContent.slice(userContent.indexOf("EXISTING DEFERRED PRIORITIES"));
    expect(section.length).toBeGreaterThan(100);   // the section really is there
    for (const word of MATURITY_WORDS) {
      expect(section, `deferred-priority evidence leaked "${word}"`).not.toContain(word);
    }
    expect(deferredPrioritySchemaBlock()).not.toMatch(/PHV|mirwald|maturity/i);
  });
});

// ── season report ────────────────────────────────────────────────────────────

describe("season report — the maturity estimate is not in the prompt", () => {
  const run = async (cm) => {
    const { generateSeasonReport } = await import("./seasonReport.js");
    return captureFor(() => generateSeasonReport("a1", [MATCH]), cm);
  };

  it("sends a BYTE-IDENTICAL system and user prompt across the whole range", async () => {
    const low = await run(LOW_SITTING);
    const high = await run(HIGH_SITTING);
    expect(high.system).toBe(low.system);
    expect(high.userContent).toBe(low.userContent);
  });

  it("names no maturity band or stage implication at any estimate", async () => {
    for (const cm of [LOW_SITTING, 80, HIGH_SITTING]) {
      const { system, userContent } = await run(cm);
      for (const word of MATURITY_WORDS) {
        expect(userContent, `season prompt leaked "${word}"`).not.toContain(word);
        expect(system, `season system prompt leaked "${word}"`).not.toContain(word);
      }
    }
  });

  it("asks for a developmental-stage paragraph WITHOUT supplying a maturity band", async () => {
    // The report has a `developmentalStageAssessment` field. That is the model
    // reading match data and age — it must not be the model reading Mirwald.
    const { system, userContent } = await run(80);
    expect(system).toContain("developmentalStageAssessment");
    expect(system).toMatch(/contextualised for age \d+ and her .* division/);
    for (const word of MATURITY_WORDS) {
      expect(system).not.toContain(word);
      expect(userContent).not.toContain(word);
    }
  });

  it("hands the standing-season-priority fields no maturity evidence", async () => {
    // nextMonthPriority and longTermOutlook become the standing season
    // priority, which match analysis then reads back. Same requirement.
    const { system, userContent } = await run(80);
    expect(system).toContain("nextMonthPriority");
    expect(system).toContain("longTermOutlook");
    expect(`${system}\n${userContent}`).not.toMatch(/PHV|mirwald|maturity|growth spurt/i);
  });
});
