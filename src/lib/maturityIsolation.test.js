import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { maturityOffset } from "./maturity.js";
import { assessGuardian, cooldownDecision, buildGuardianNotesPrompt, isDecisionEvidence } from "./guardianCore.js";
import { recentGrowthContext } from "./growth.js";
import { readinessScore } from "./load.js";
import { buildWeeklyStrengthPlanPrompt } from "./planGenCore.js";
import { FIXTURE_NOW, fixtureArgs, fixtureCtx } from "./__fixtures__/weeklyPlanFixture.js";

// ─── THE MIRWALD ESTIMATE DECIDES NOTHING ────────────────────────────────────
// The maturity offset is a population regression with years of individual
// error. It is shown to a parent and it is carried in the assessment metadata;
// it must not be able to move a single output. This file is the proof, one
// test per output the correction brief names:
//
//   1 Guardian gate result      5 Guardian cooldown / escalation
//   2 Guardian severity         6 readiness
//   3 counted factor set        7 Growth Watch
//   4 recommended action        + the S&C session and the progression gate
//
// The two AI paths — match analysis and the season report, which write the
// deferred and standing priorities that later steer planning — are proved
// separately in maturityAiIsolation.test.js, because they need the Firestore
// and model boundaries stubbed and this file is pure.
//
// The method throughout is single-variable. `dob` is the only maturity input
// that moves the estimate across all three bands, and inside guardianCore it
// is read by NOTHING except maturityOffset — growthFactors takes velocity from
// dated height history, which has no birthday in it. For the S&C path `dob`
// also feeds the identity block (age, division), so there the lever is
// `sittingHeight`, which the entire plan pipeline ignores.

const AT = new Date("2026-08-12T06:00:00");

// Same anthropometry, three birthdays, three genuinely different estimates.
const MEASUREMENTS = [
  { date: "2026-08-01", height: 153, sittingHeight: 80, weight: 43 },
  { date: "2026-02-01", height: 149, sittingHeight: 78, weight: 40 },
];
const DOBS = { pre: "2017-03-07", mid: "2014-03-07", post: "2010-03-07" };
const athleteWith = (dob) => ({ dob, measurements: MEASUREMENTS });

describe("the fixture really does move the estimate", () => {
  it("spans Pre-PHV, Mid-PHV and Post-PHV on identical body measurements", () => {
    const of = (dob) => maturityOffset({
      dob, heightCm: 153, sittingHeightCm: 80, weightKg: 43, date: AT,
    });
    expect(of(DOBS.pre).stage).toBe("Pre-PHV");
    expect(of(DOBS.mid).stage).toBe("Mid-PHV");
    expect(of(DOBS.post).stage).toBe("Post-PHV");
    // ...and by a wide margin, not a rounding nudge.
    expect(of(DOBS.post).offset - of(DOBS.pre).offset).toBeGreaterThan(3);
  });
});

describe("Guardian — changing only the maturity estimate", () => {
  // A live, firing assessment, so the comparison is between three real alerts
  // rather than three silences. Load: seven training days, no rest day.
  const WEEK_LOGS = [
    { date: "2026-08-06", rpe: 10, duration: 60 }, { date: "2026-08-07", rpe: 10, duration: 60 },
    { date: "2026-08-08", rpe: 10, duration: 60 }, { date: "2026-08-09", rpe: 10, duration: 20 },
    { date: "2026-08-10", rpe: 10, duration: 60 }, { date: "2026-08-11", rpe: 10, duration: 20 },
    { date: "2026-08-12", rpe: 10, duration: 20 },
  ];
  const WELLBEING = [
    { date: "2026-08-10", type: "checkin", mood: 2, soreness: 2, sleep: 8 },
    { date: "2026-08-11", type: "checkin", mood: 2, soreness: 2, sleep: 8 },
    { date: "2026-08-12", type: "checkin", mood: 2, soreness: 2, sleep: 8 },
  ];

  const assess = (dob) => assessGuardian(
    { athlete: athleteWith(dob), weekLogs: WEEK_LOGS, wellbeing: WELLBEING }, AT,
  );
  const variants = () => [assess(DOBS.pre), assess(DOBS.mid), assess(DOBS.post)];

  it("records the estimate as metadata, so the fixture is not vacuous", () => {
    const stages = variants().map(a => a.metrics.maturityStage);
    expect(stages).toEqual(["Pre-PHV", "Mid-PHV", "Post-PHV"]);
    expect(new Set(variants().map(a => a.metrics.maturityOffset)).size).toBe(3);
  });

  it("1. cannot change the gate result", () => {
    const [a, b, c] = variants();
    expect(a.fires).toBe(true);           // a real alert, not three silences
    expect([b.fires, c.fires]).toEqual([a.fires, a.fires]);
    expect([b.reason, c.reason]).toEqual([a.reason, a.reason]);
  });

  it("2. cannot change severity", () => {
    const [a, b, c] = variants();
    expect(a.severity).not.toBeNull();
    expect([b.severity, c.severity]).toEqual([a.severity, a.severity]);
    expect([b.tone, c.tone]).toEqual([a.tone, a.tone]);
    expect([b.acuteWeight, c.acuteWeight]).toEqual([a.acuteWeight, a.acuteWeight]);
  });

  it("3. cannot change the counted factor set", () => {
    const counted = (a) => a.factors.filter(f => f.counts !== false).map(f => f.id).sort();
    const [a, b, c] = variants();
    expect(counted(b)).toEqual(counted(a));
    expect(counted(c)).toEqual(counted(a));
    expect([b.families, c.families]).toEqual([a.families, a.families]);
    expect([b.storyKey, c.storyKey]).toEqual([a.storyKey, a.storyKey]);
    expect([b.factorKey, c.factorKey]).toEqual([a.factorKey, a.factorKey]);
  });

  it("4. cannot change the recommended action or the headline", () => {
    const [a, b, c] = variants();
    expect(a.actions.athlete.length).toBeGreaterThan(0);
    expect([b.actions, c.actions]).toEqual([a.actions, a.actions]);
    expect([b.headline, c.headline]).toEqual([a.headline, a.headline]);
  });

  it("5. cannot change cooldown or escalation behaviour", () => {
    const [a, b, c] = variants();
    const prior = { current: {
      storyKey: a.storyKey, factorKey: a.factorKey, families: [...a.families],
      severity: a.severity, acuteWeight: a.acuteWeight,
      firstFiredDate: "2026-08-10", lastFiredDate: "2026-08-10", firstSeenDate: "2026-08-10",
      fireCount: 1, cleared: false, clearedDate: null, reason: "first-fire",
    } };
    const decide = (x) => cooldownDecision(prior, x, AT);
    expect(decide(b)).toEqual(decide(a));
    expect(decide(c)).toEqual(decide(a));
    // ...and from a clean slate, where the record that would be WRITTEN differs
    // if anything the estimate touches leaked into it.
    expect(cooldownDecision(null, b, AT)).toEqual(cooldownDecision(null, a, AT));
    expect(cooldownDecision(null, c, AT)).toEqual(cooldownDecision(null, a, AT));
  });

  it("6. cannot change readiness", () => {
    const [a, b, c] = variants();
    expect(a.metrics.readiness).not.toBeNull();
    expect([b.metrics.readiness, c.metrics.readiness]).toEqual([a.metrics.readiness, a.metrics.readiness]);
    // readinessScore has no maturity parameter to pass one through.
    expect(readinessScore.length).toBe(3);
  });

  it("7. cannot change Growth Watch or the measured growth velocity", () => {
    const [a, b, c] = variants();
    for (const key of ["growthWatch", "growthVelocity", "growthSpanDays", "growthSufficientInterval"]) {
      expect([b.metrics[key], c.metrics[key]]).toEqual([a.metrics[key], a.metrics[key]]);
    }
    // recentGrowthContext never sees a birthday or a sitting height.
    expect(recentGrowthContext(MEASUREMENTS))
      .toEqual(recentGrowthContext(MEASUREMENTS.map(m => ({ ...m, sittingHeight: m.sittingHeight + 8 }))));
  });

  // ── 8. THE NOTE MODEL'S PROMPT ────────────────────────────────────
  // The seven outputs above are deterministic, and they were already clean.
  // This one is not: buildGuardianNotesPrompt hands its factor list to a model
  // that writes the parent note, and that note ends with "the one concrete
  // change to make today". It is the last place the estimate could reach an
  // actionable recommendation, and the strongest available statement about it
  // is not "the severity matched" but "the model received the same bytes".
  describe("8. the Guardian note prompt", () => {
    const promptFor = (dob) => buildGuardianNotesPrompt(assess(dob), "Vee");

    it("is BYTE-IDENTICAL across Pre-PHV, Mid-PHV and Post-PHV", () => {
      const [a, b, c] = [promptFor(DOBS.pre), promptFor(DOBS.mid), promptFor(DOBS.post)];
      expect(b.system).toBe(a.system);
      expect(c.system).toBe(a.system);
      expect(b.prompt).toBe(a.prompt);
      expect(c.prompt).toBe(a.prompt);
      expect(b.maxTokens).toBe(a.maxTokens);
      // ...and the comparison is between three REAL prompts, not three empty
      // ones: the fixture fires, and the prompt carries its factors.
      expect(assess(DOBS.mid).fires).toBe(true);
      expect(a.prompt).toContain("FACTORS THE ENGINE FOUND:");
      expect(a.prompt.split("\n").filter(l => l.startsWith("- [")).length).toBeGreaterThan(0);
    });

    it("carries the same number of evidence lines whatever the estimate", () => {
      // The Mid-PHV variant is the one that gains an extra factor in
      // `assessment.factors`. The prompt must not gain a line for it.
      const linesOf = (dob) => promptFor(dob).prompt
        .split("\n").filter(l => l.startsWith("- ["));
      const counted = (dob) => assess(dob).factors.filter(isDecisionEvidence).length;

      expect(assess(DOBS.mid).factors.length).toBeGreaterThan(assess(DOBS.pre).factors.length);
      expect(counted(DOBS.mid)).toBe(counted(DOBS.pre));
      expect(linesOf(DOBS.mid)).toEqual(linesOf(DOBS.pre));
      expect(linesOf(DOBS.mid).length).toBe(counted(DOBS.mid));
    });

    it("names no maturity band, offset or stage implication in the evidence", () => {
      for (const dob of Object.values(DOBS)) {
        const { prompt, system } = promptFor(dob);
        // Everything before the response schema is the evidence. The schema is
        // excluded because it BANS two of these words rather than supplying
        // them ("never use the words … or PHV", "Never use these words: …
        // growth spurt …").
        const evidence = prompt.slice(0, prompt.indexOf("Respond with exactly this JSON structure:"));
        expect(evidence).toContain("FACTORS THE ENGINE FOUND:");
        for (const banned of [
          "mid-phv-window", "Mid-PHV", "Pre-PHV", "Post-PHV", "PHV",
          "Mirwald", "maturity", "maturation", "growth spurt", "maturity offset", "estimate",
        ]) {
          expect(evidence, `${dob}: evidence leaked "${banned}"`).not.toContain(banned);
          expect(system, `${dob}: system leaked "${banned}"`).not.toContain(banned);
        }
      }
    });

    it("still exposes the estimate to the parent-facing assessment", () => {
      // Isolating the model must not quietly delete the parent's context: the
      // factor is still on the assessment, and the metrics still carry it.
      const a = assess(DOBS.mid);
      expect(a.factors.map(f => f.id)).toContain("mid-phv-window");
      expect(a.metrics.maturityStage).toBe("Mid-PHV");
      expect(a.metrics.maturityOffset).not.toBeNull();
    });
  });

  it("keeps the informational mid-PHV factor at weight 0 and counts:false", () => {
    const mid = assess(DOBS.mid).factors.find(f => f.id === "mid-phv-window");
    expect(mid).toBeTruthy();                 // it is present as metadata...
    expect(mid.weight).toBe(0);               // ...and it is inert.
    expect(mid.counts).toBe(false);
    expect(mid.standalone).toBe(false);

    // The `growth` family IS present here — earned by MEASURED velocity
    // (149 cm to 153 cm over ~6 months), which is the only growth input with a
    // vote. The estimate contributes nothing to it: the mid-PHV factor is not
    // among the counted ones, and the band is identical whichever birthday the
    // fixture uses.
    const countedGrowth = (dob) => assess(dob).factors
      .filter(f => f.counts !== false && f.family === "growth").map(f => f.id).sort();
    expect(countedGrowth(DOBS.mid)).toEqual(["rapid-growth"]);
    expect(countedGrowth(DOBS.mid)).not.toContain("mid-phv-window");
    expect(countedGrowth(DOBS.pre)).toEqual(countedGrowth(DOBS.mid));
    expect(countedGrowth(DOBS.post)).toEqual(countedGrowth(DOBS.mid));

    // And the band never appears at all outside the Mid-PHV window, so it
    // cannot be what carried the family in.
    expect(assess(DOBS.pre).factors.map(f => f.id)).not.toContain("mid-phv-window");
  });
});

describe("S&C — the plan pipeline cannot see the maturity estimate at all", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(FIXTURE_NOW)); });
  afterAll(() => vi.useRealTimers());

  // sittingHeight is a Mirwald input and NOTHING else in the app reads it, so
  // moving it is a pure maturity-estimate change.
  const withSittingHeight = (cm) => ({
    ...fixtureArgs,
    ctx: fixtureCtx,
    profile: {
      ...fixtureArgs.profile,
      sittingHeight: cm,
      measurements: fixtureArgs.profile.measurements.map(
        m => (m.sittingHeight != null ? { ...m, sittingHeight: cm } : m),
      ),
    },
  });

  it("moves the estimate materially before the comparison is made", () => {
    const of = (cm) => maturityOffset({
      dob: fixtureArgs.profile.dob, heightCm: 153, sittingHeightCm: cm, weightKg: 43,
      date: new Date(FIXTURE_NOW),
    }).offset;
    expect(Math.abs(of(88) - of(70))).toBeGreaterThan(0.5);
  });

  it("produces a BYTE-IDENTICAL prompt across the whole range", () => {
    const at = (cm) => buildWeeklyStrengthPlanPrompt(withSittingHeight(cm));
    expect(at(88).prompt).toBe(at(70).prompt);
    expect(at(88).system).toBe(at(70).system);
  });

  it("produces an identical session framework and progression gate", () => {
    const a = buildWeeklyStrengthPlanPrompt(withSittingHeight(70));
    const b = buildWeeklyStrengthPlanPrompt(withSittingHeight(88));
    expect(b.framework).toEqual(a.framework);
    expect(b.progression).toEqual(a.progression);
    expect(b.growthContext).toEqual(a.growthContext);
  });

  it("never names a maturity band in the prompt, whatever the estimate", () => {
    for (const cm of [70, 80, 88]) {
      const text = buildWeeklyStrengthPlanPrompt(withSittingHeight(cm)).prompt;
      for (const band of ["Pre-PHV", "Mid-PHV", "Post-PHV", "maturity offset", "Mirwald"]) {
        expect(text).not.toContain(band);
      }
    }
  });
});

// ─── THE STAGE-IMPLICATION TEXT HAS NO PRODUCTION CALLER ─────────────────────
// stageInfo(stage) returns {label, implication} — the sentence that used to
// appear as "Training Implication" on the parent screens and, appended to
// athleteContextCore's identityText, as the first line of the match-analysis
// and season-report prompts. Both call sites are gone.
//
// The definitions stay in maturity.js as the canonical non-prescriptive wording
// for anyone who displays the estimate later. This guard is what makes that
// safe: re-wiring one is a failing test, not a quiet regression. The AI-side
// proof lives in maturityAiIsolation.test.js.
describe("no production file reads the stage implication", () => {
  const REPO = path.resolve(".");
  const ROOTS = [
    { dir: path.join(REPO, "src"), exts: [".js", ".jsx"] },
    { dir: path.join(REPO, "functions"), exts: [".js"], shallow: true },
    { dir: path.join(REPO, "functions", "shared"), exts: [".js"] },
  ];
  const isTest = (f) => /\.test\.(js|jsx)$/.test(f) || f.includes("__fixtures__");

  const walk = (dir, exts, shallow) => {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shallow || entry.name === "node_modules") continue;
        out.push(...walk(full, exts, false));
      } else if (exts.includes(path.extname(entry.name)) && !isTest(full)) {
        out.push(full);
      }
    }
    return out;
  };

  // maturity.js itself defines them; it is not a caller.
  const files = ROOTS
    .flatMap(r => walk(r.dir, r.exts, r.shallow))
    .filter(f => path.basename(f) !== "maturity.js");

  it("scans a non-trivial number of production files", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some(f => f.endsWith("athleteContextCore.js"))).toBe(true);
    expect(files.some(f => f.endsWith("MeScreen.jsx"))).toBe(true);
  });

  it("imports neither stageInfo nor MATURITY_ESTIMATE_LABEL anywhere", () => {
    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      // Import specifiers only — a mention inside a comment is documentation.
      for (const [, names] of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*maturity\.js["']/g)) {
        for (const banned of ["stageInfo", "MATURITY_ESTIMATE_LABEL"]) {
          if (names.includes(banned)) offenders.push(`${path.relative(REPO, f)} imports ${banned}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is imported by exactly the files allowed to compute it, and no others", () => {
    // This is what backs the parent-facing claim on the Benchmarks panel:
    // "No AI prompt in this app is given it." A module that cannot import
    // maturity.js cannot put the estimate in a prompt, so the import list IS
    // the boundary. guardianCore computes it for `metrics` and for the
    // zero-weight informational factor, both of which are excluded from the
    // note prompt by isDecisionEvidence; the other two are parent-facing UI.
    const ALLOWED = new Set([
      "src/lib/guardianCore.js",
      "functions/shared/guardianCore.js",
      "src/screens/MeScreen.jsx",
      "src/tabs/BenchmarksTab.jsx",
    ]);
    const importers = files
      .filter(f => /from\s*["'][^"']*maturity\.js["']/.test(fs.readFileSync(f, "utf8")))
      .map(f => path.relative(REPO, f).split(path.sep).join("/"))
      .sort();
    // The exact set, so the guard cannot pass by finding nothing.
    expect(importers).toEqual([
      "functions/shared/guardianCore.js",
      "src/lib/guardianCore.js",
      "src/screens/MeScreen.jsx",
      "src/tabs/BenchmarksTab.jsx",
    ]);
    for (const f of importers) {
      expect(ALLOWED, `${f} imports maturity.js`).toContain(f);
    }
    // ...and every prompt builder in the app is outside that set.
    for (const f of ["src/lib/digestCore.js", "src/lib/athleteMemoryCore.js",
                     "src/lib/planGenCore.js", "src/lib/matchAnalysis.js",
                     "src/lib/seasonReport.js", "src/lib/coachReport.js",
                     "src/lib/athleteContextCore.js"]) {
      expect(importers, `${f} must not import maturity.js`).not.toContain(f);
    }
  });

  it("renders no Training Implication line on any screen", () => {
    const offenders = [];
    for (const f of files.filter(x => x.endsWith(".jsx"))) {
      const src = fs.readFileSync(f, "utf8");
      if (/Training [Ii]mplication/.test(src)) offenders.push(path.relative(REPO, f));
    }
    expect(offenders).toEqual([]);
  });

  it("gives the maturity band no colour on the parent screens", () => {
    // A stage-keyed colour map is a verdict: it tells a parent the estimate
    // grades their child, and green/orange invites ranking the bands.
    for (const rel of ["src/screens/MeScreen.jsx", "src/tabs/BenchmarksTab.jsx"]) {
      const src = fs.readFileSync(path.join(REPO, rel), "utf8");
      // No object literal keyed on the bands.
      expect(src, `${rel} keys a colour off the maturity band`)
        .not.toMatch(/\{\s*"?Pre-PHV"?\s*:/);
    }
  });
});
