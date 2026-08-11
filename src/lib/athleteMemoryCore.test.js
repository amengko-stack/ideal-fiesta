import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  emptyMemory, capMemory, memoryBlock, recordDivisionChange,
  buildMemoryUpdatePrompt, mergeMemoryUpdate,
} from "./athleteMemoryCore.js";

describe("emptyMemory", () => {
  it("returns the null-shaped default", () => {
    const m = emptyMemory();
    expect(m.narrative).toBe("");
    expect(m.trajectory).toBe("");
    expect(m.persistentPatterns).toEqual([]);
    expect(m.whatWorked).toEqual([]);
    expect(m.whatDidNotWork).toEqual([]);
    expect(m.milestones).toEqual([]);
    expect(m.standingConstraints).toEqual([]);
    expect(m.divisionHistory).toEqual([]);
    expect(m.shoutouts).toEqual([]);
    expect(m.version).toBe(1);
  });
});

describe("capMemory", () => {
  it("caps persistentPatterns at 8, keeping active/improving over resolved", () => {
    const patterns = [];
    for (let i = 0; i < 6; i++) {
      patterns.push({ pattern: `active-${i}`, status: "active", lastSeen: `2026-01-${10 + i}`, firstSeen: "2026-01-01" });
    }
    for (let i = 0; i < 5; i++) {
      patterns.push({ pattern: `resolved-${i}`, status: "resolved", lastSeen: `2026-02-${10 + i}`, firstSeen: "2026-01-01" });
    }
    const result = capMemory({ persistentPatterns: patterns });
    expect(result.persistentPatterns.length).toBe(8);
    // All 6 active entries survive; only 2 resolved should remain.
    const activeCount = result.persistentPatterns.filter(p => p.status === "active").length;
    const resolvedCount = result.persistentPatterns.filter(p => p.status === "resolved").length;
    expect(activeCount).toBe(6);
    expect(resolvedCount).toBe(2);
  });

  it("caps whatWorked at 6, dropping oldest not newest", () => {
    const whatWorked = Array.from({ length: 9 }, (_, i) => ({
      intervention: `int-${i}`, evidence: "e", date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    }));
    const result = capMemory({ whatWorked });
    expect(result.whatWorked.length).toBe(6);
    expect(result.whatWorked.map(w => w.intervention)).toEqual([
      "int-8", "int-7", "int-6", "int-5", "int-4", "int-3",
    ]);
  });

  it("caps whatDidNotWork at 6, dropping oldest", () => {
    const whatDidNotWork = Array.from({ length: 8 }, (_, i) => ({
      intervention: `x-${i}`, date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    }));
    const result = capMemory({ whatDidNotWork });
    expect(result.whatDidNotWork.length).toBe(6);
    expect(result.whatDidNotWork[0].intervention).toBe("x-7");
  });

  it("caps milestones at 12, dropping oldest", () => {
    const milestones = Array.from({ length: 15 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`, text: `m-${i}`,
    }));
    const result = capMemory({ milestones });
    expect(result.milestones.length).toBe(12);
    expect(result.milestones[0].text).toBe("m-14");
    expect(result.milestones[11].text).toBe("m-3");
  });

  it("caps standingConstraints at 6, keeping the most recently appended", () => {
    const standingConstraints = Array.from({ length: 9 }, (_, i) => `constraint-${i}`);
    const result = capMemory({ standingConstraints });
    expect(result.standingConstraints.length).toBe(6);
    expect(result.standingConstraints).toEqual([
      "constraint-3", "constraint-4", "constraint-5", "constraint-6", "constraint-7", "constraint-8",
    ]);
  });

  it("caps shoutouts at 5, keeping newest-first order intact", () => {
    const shoutouts = Array.from({ length: 8 }, (_, i) => `msg-${i}`);
    const result = capMemory({ shoutouts });
    expect(result.shoutouts.length).toBe(5);
    expect(result.shoutouts).toEqual(["msg-0", "msg-1", "msg-2", "msg-3", "msg-4"]);
  });

  it("is pure — does not mutate the input", () => {
    const input = { whatWorked: [{ intervention: "a", date: "2026-01-01" }] };
    const snapshot = JSON.parse(JSON.stringify(input));
    capMemory(input);
    expect(input).toEqual(snapshot);
  });

  it("handles an already-empty memory without error", () => {
    const result = capMemory(emptyMemory());
    expect(result.persistentPatterns).toEqual([]);
    expect(result.shoutouts).toEqual([]);
  });
});

describe("memoryBlock", () => {
  it("returns empty string for an empty memory", () => {
    expect(memoryBlock(emptyMemory())).toBe("");
  });

  it("returns empty string for null/undefined", () => {
    expect(memoryBlock(null)).toBe("");
    expect(memoryBlock(undefined)).toBe("");
  });

  it("renders narrative and trajectory when present", () => {
    const block = memoryBlock({ ...emptyMemory(), narrative: "She is a fighter.", trajectory: "Improving serve." });
    expect(block).toContain("ATHLETE DEVELOPMENT MEMORY:");
    expect(block).toContain("Who she is: She is a fighter.");
    expect(block).toContain("Recent trajectory: Improving serve.");
  });

  it("omits sections that are empty", () => {
    const block = memoryBlock({ ...emptyMemory(), narrative: "Only narrative." });
    expect(block).toContain("Who she is:");
    expect(block).not.toContain("Persistent patterns:");
    expect(block).not.toContain("What has worked:");
    expect(block).not.toContain("What has NOT worked:");
    expect(block).not.toContain("Milestones:");
    expect(block).not.toContain("Standing constraints:");
    expect(block).not.toContain("Division history:");
  });

  it("renders persistentPatterns with status and evidence", () => {
    const block = memoryBlock({
      ...emptyMemory(),
      persistentPatterns: [{ pattern: "Late backhand prep", status: "improving", firstSeen: "2026-01-01", lastSeen: "2026-02-01", evidence: "Fewer UEs in last 3 matches" }],
    });
    expect(block).toContain("Persistent patterns:");
    expect(block).toContain("[improving] Late backhand prep");
    expect(block).toContain("Fewer UEs in last 3 matches");
  });

  it("renders whatWorked, whatDidNotWork and milestones", () => {
    const block = memoryBlock({
      ...emptyMemory(),
      whatWorked: [{ intervention: "Extra serve reps", evidence: "1st serve % up", date: "2026-01-10" }],
      whatDidNotWork: [{ intervention: "Heavier squats", evidence: "Soreness spiked", date: "2026-01-15" }],
      milestones: [{ date: "2026-01-20", text: "First win vs an U14 seed" }],
    });
    expect(block).toContain("What has worked:");
    expect(block).toContain("Extra serve reps");
    expect(block).toContain("What has NOT worked:");
    expect(block).toContain("Heavier squats");
    expect(block).toContain("Milestones:");
    expect(block).toContain("First win vs an U14 seed");
  });

  it("renders standingConstraints and divisionHistory", () => {
    const block = memoryBlock({
      ...emptyMemory(),
      standingConstraints: ["Avoid heavy overhead pressing — growth plates open"],
      divisionHistory: [{ category: "U14", from: "U12", to: "U14", date: "2026-01-01" }],
    });
    expect(block).toContain("Standing constraints:");
    expect(block).toContain("Avoid heavy overhead pressing");
    expect(block).toContain("Division history:");
  });
});

describe("recordDivisionChange", () => {
  it("appends a new entry when the category changes", () => {
    const memory = emptyMemory();
    const result = recordDivisionChange(memory, "U14", "2026-03-01");
    expect(result.divisionHistory.length).toBe(1);
    expect(result.divisionHistory[0]).toEqual({ category: "U14", from: null, to: "U14", date: "2026-03-01" });
  });

  it("no-ops when the category is unchanged", () => {
    const memory = { ...emptyMemory(), divisionHistory: [{ category: "U14", from: "U12", to: "U14", date: "2026-01-01" }] };
    const result = recordDivisionChange(memory, "U14", "2026-03-01");
    expect(result.divisionHistory.length).toBe(1);
    expect(result.divisionHistory[0].date).toBe("2026-01-01");
  });

  it("closes the previous entry's `to` by appending a new entry with `from` set to the prior `to`", () => {
    const memory = { ...emptyMemory(), divisionHistory: [{ category: "U14", from: "U12", to: "U14", date: "2026-01-01" }] };
    const result = recordDivisionChange(memory, "U16", "2026-06-01");
    expect(result.divisionHistory.length).toBe(2);
    expect(result.divisionHistory[1]).toEqual({ category: "U16", from: "U14", to: "U16", date: "2026-06-01" });
  });

  it("is pure — does not mutate the input", () => {
    const memory = { ...emptyMemory(), divisionHistory: [{ category: "U14", from: "U12", to: "U14", date: "2026-01-01" }] };
    const snapshot = JSON.parse(JSON.stringify(memory));
    recordDivisionChange(memory, "U16", "2026-06-01");
    expect(memory).toEqual(snapshot);
  });

  it("no-ops when category is falsy", () => {
    const memory = emptyMemory();
    const result = recordDivisionChange(memory, null, "2026-03-01");
    expect(result.divisionHistory).toEqual([]);
  });
});

// ─── MEMORY UPDATE PROMPTS ───────────────────────────────────────────────────
// The match and season bodies were moved here verbatim from athleteMemory.js;
// these assertions pin the wording that used to live inline there.

const TODAY = "2026-03-15";

const filledMemory = () => ({
  ...emptyMemory(),
  narrative: "A counter-puncher learning to attack short balls.",
  trajectory: "Serve is steadier over the last 8 weeks.",
  persistentPatterns: [{ pattern: "Late split step", status: "active", firstSeen: "2026-01-01", lastSeen: "2026-03-01" }],
  standingConstraints: ["No heavy overhead pressing"],
  divisionHistory: [{ category: "U14", from: "U12", to: "U14", date: "2026-01-01" }],
  shoutouts: ["Great fight out there!"],
});

const SCHEMA_LINE = '"narrative": "4-6 sentences: who she is as a player now and how she got here"';

describe("buildMemoryUpdatePrompt — shared structure", () => {
  it.each(["match", "season", "weeklyReview"])("%s: keeps the revise-and-merge system contract", (kind) => {
    const { system, maxTokens } = buildMemoryUpdatePrompt(filledMemory(), { kind, todayStr: TODAY });
    expect(system).toContain("You maintain a bounded longitudinal memory of a junior tennis athlete's development for a coaching AI.");
    expect(system).toContain("REVISE AND MERGE — do not simply append.");
    expect(system).toContain("Return ONLY a raw JSON object matching the given schema.");
    expect(system).toContain("Start your response with { and end with }.");
    expect(maxTokens).toBe(1500);
  });

  it.each(["match", "season", "weeklyReview"])("%s: leads with the current memory and closes with the schema", (kind) => {
    const { userContent } = buildMemoryUpdatePrompt(filledMemory(), { kind, todayStr: TODAY });
    expect(userContent.startsWith("CURRENT MEMORY:\n{")).toBe(true);
    expect(userContent).toContain("A counter-puncher learning to attack short balls.");
    expect(userContent).toContain("Late split step");
    expect(userContent).toContain("Respond with exactly this JSON structure:");
    expect(userContent).toContain(SCHEMA_LINE);
    expect(userContent.endsWith("}")).toBe(true);
  });

  it("withholds divisionHistory and shoutouts from the model", () => {
    const { userContent } = buildMemoryUpdatePrompt(filledMemory(), { kind: "match", todayStr: TODAY });
    expect(userContent).not.toContain("divisionHistory");
    expect(userContent).not.toContain("shoutouts");
    expect(userContent).not.toContain("Great fight out there!");
  });

  it("names the evidence source differently per kind", () => {
    const s = (kind) => buildMemoryUpdatePrompt(emptyMemory(), { kind, todayStr: TODAY }).system;
    expect(s("match")).toContain("NEW evidence from a just-analysed match");
    expect(s("season")).toContain("a NEW season report covering multiple matches");
    expect(s("weeklyReview")).toContain("a NEW weekly review covering the week's training load, wellbeing, plan and focus priorities");
  });

  it("defaults an unknown kind to match", () => {
    const { userContent } = buildMemoryUpdatePrompt(emptyMemory(), { kind: "nonsense", todayStr: TODAY });
    expect(userContent).toContain("NEW MATCH EVIDENCE");
  });

  it("survives a null memory and a null evidence object", () => {
    expect(() => buildMemoryUpdatePrompt(null, null)).not.toThrow();
    const { userContent } = buildMemoryUpdatePrompt(null, null);
    expect(userContent).toContain("NEW MATCH EVIDENCE");
    expect(userContent).not.toContain("undefined");
  });
});

describe("buildMemoryUpdatePrompt — match evidence", () => {
  const evidence = {
    kind: "match",
    todayStr: TODAY,
    match: { opponentName: "Kirana", whoWonMatch: 1 },
    analysis: {
      matchSummary: "Controlled the middle of the court.",
      criticalFindings: [{ priority: "critical", finding: "Second serve sat up" }],
      strengthsToReinforce: ["Depth on the forehand", "Court position"],
      deferredPriorities: [{ priority: "Net play conversion" }],
    },
  };

  it("renders the match block exactly as athleteMemory.js used to", () => {
    const { userContent } = buildMemoryUpdatePrompt(filledMemory(), evidence);
    expect(userContent).toContain(`NEW MATCH EVIDENCE (${TODAY}):
Opponent: Kirana — WIN
Match summary: Controlled the middle of the court.
Critical findings: [critical] Second serve sat up
Strengths reinforced: Depth on the forehand, Court position
Deferred priorities from this match: Net play conversion`);
  });

  it("marks a loss and fills every gap with None/—", () => {
    const { userContent } = buildMemoryUpdatePrompt(emptyMemory(), { kind: "match", todayStr: TODAY, match: { whoWonMatch: 0 }, analysis: {} });
    expect(userContent).toContain("Opponent: Unknown — LOSS");
    expect(userContent).toContain("Match summary: —");
    expect(userContent).toContain("Critical findings: None");
    expect(userContent).toContain("Strengths reinforced: None");
    expect(userContent).toContain("Deferred priorities from this match: None");
  });
});

describe("buildMemoryUpdatePrompt — season evidence", () => {
  const evidence = {
    kind: "season",
    todayStr: TODAY,
    report: {
      matchCount: 14,
      overallRecord: "9-5",
      developmentalStageAssessment: "Mid-PHV, coordination catching up.",
      consistentWeaknesses: [{ metric: "2nd serve", pattern: "sits up under pressure" }],
      improvements: [{ metric: "rally tolerance", trend: "up 12%" }],
      nextMonthPriority: "Attack short balls.",
      longTermOutlook: "Aggressive baseliner.",
    },
  };

  it("renders the season block exactly as athleteMemory.js used to", () => {
    const { userContent } = buildMemoryUpdatePrompt(filledMemory(), evidence);
    expect(userContent).toContain(`NEW SEASON REPORT (${TODAY}, 14 matches, record 9-5):
Developmental stage: Mid-PHV, coordination catching up.
Consistent weaknesses: 2nd serve: sits up under pressure
Improvements: rally tolerance: up 12%
Next month priority: Attack short balls.
Long-term outlook: Aggressive baseliner.`);
  });

  it("uses ? and — for an empty report", () => {
    const { userContent } = buildMemoryUpdatePrompt(emptyMemory(), { kind: "season", todayStr: TODAY, report: {} });
    expect(userContent).toContain(`NEW SEASON REPORT (${TODAY}, ? matches, record —):`);
    expect(userContent).toContain("Consistent weaknesses: None");
  });
});

describe("buildMemoryUpdatePrompt — weeklyReview evidence", () => {
  const week = {
    weekKey: "2026-03-09",
    load: { thisWeekSRPE: 1215, fourWeekAvg: 379, acwr: 3.21, acwrStatus: { label: "Ease up" }, sessionCount: 3 },
    wellbeing: { checkinCount: 2, avgSleep: 6.25, avgMood: 2, avgSoreness: 2.5, lowMoodFlag: true, lowSleepFlag: false },
    matches: [{ opponentName: "Kirana", won: true, date: "2026-03-14" }],
    priorities: {
      open: 2,
      weeklyFocus: "Second serve under pressure",
      resolvedThisRun: ["Drop shot disguise"],
      escalatedThisRun: ["Second serve under pressure"],
    },
    plan: { sessionType: "reduced", sessionDuration: 45, exerciseCount: 8, coachNote: "Lighter while the ankle settles." },
    injuries: { openCount: 1, flagHeadline: "Ankle — avoid loading this area" },
  };

  it("summarises the week's load, wellbeing, plan, priorities and matches", () => {
    const { userContent } = buildMemoryUpdatePrompt(filledMemory(), { kind: "weeklyReview", todayStr: TODAY, week });
    expect(userContent).toContain(`NEW WEEKLY REVIEW (${TODAY}, week of 2026-03-09):`);
    expect(userContent).toContain("Training load: sRPE 1215 vs 4-week average 379, ACWR 3.21 (Ease up), 3 sessions");
    expect(userContent).toContain("Wellbeing: 2 check-ins — sleep 6.25h, mood 2/5, soreness 2.5/5 — LOW MOOD 3+ consecutive days");
    expect(userContent).toContain("Matches played: WIN vs Kirana (2026-03-14)");
    expect(userContent).toContain("Plan prescribed: reduced, 45 min, 8 exercises");
    expect(userContent).toContain("Plan rationale: Lighter while the ankle settles.");
    expect(userContent).toContain("This week's focus priority: Second serve under pressure");
    expect(userContent).toContain("Priorities resolved this week: Drop shot disguise");
    expect(userContent).toContain("Priorities escalated this week: Second serve under pressure");
    expect(userContent).toContain("Open priorities remaining: 2");
    expect(userContent).toContain("Open injuries: 1 — Ankle — avoid loading this area");
  });

  it("keeps the same head and schema footer as the other two variants", () => {
    const { userContent } = buildMemoryUpdatePrompt(filledMemory(), { kind: "weeklyReview", todayStr: TODAY, week });
    expect(userContent.startsWith("CURRENT MEMORY:\n{")).toBe(true);
    expect(userContent).toContain(SCHEMA_LINE);
  });

  it("degrades to None/— for a bare week rather than printing undefined", () => {
    const { userContent } = buildMemoryUpdatePrompt(emptyMemory(), { kind: "weeklyReview", todayStr: TODAY, week: {} });
    expect(userContent).not.toContain("undefined");
    expect(userContent).toContain("Matches played: None");
    expect(userContent).toContain("Priorities resolved this week: None");
    expect(userContent).toContain("Open injuries: None");
  });

  it("omits the low-flag suffixes when the week was fine", () => {
    const fine = { ...week, wellbeing: { ...week.wellbeing, lowMoodFlag: false, lowSleepFlag: false } };
    const { userContent } = buildMemoryUpdatePrompt(emptyMemory(), { kind: "weeklyReview", todayStr: TODAY, week: fine });
    expect(userContent).not.toContain("LOW MOOD");
    expect(userContent).not.toContain("persistent short sleep");
  });
});

describe("mergeMemoryUpdate", () => {
  const parsed = {
    narrative: "Revised narrative.",
    trajectory: "Revised trajectory.",
    persistentPatterns: [{ pattern: "Late split step", status: "improving", lastSeen: "2026-03-15" }],
    whatWorked: [{ intervention: "Serve reps", evidence: "1st serve % up", date: "2026-03-10" }],
    milestones: [{ date: "2026-03-14", text: "First win vs a U14 seed" }],
  };

  it("takes the model's revisions", () => {
    const merged = mergeMemoryUpdate(filledMemory(), parsed, "2026-03-15T09:00:00.000Z");
    expect(merged.narrative).toBe("Revised narrative.");
    expect(merged.trajectory).toBe("Revised trajectory.");
    expect(merged.persistentPatterns[0].status).toBe("improving");
    expect(merged.whatWorked[0].intervention).toBe("Serve reps");
    expect(merged.updatedAt).toBe("2026-03-15T09:00:00.000Z");
  });

  it("restores divisionHistory and shoutouts even if the model returned its own", () => {
    const hostile = { ...parsed, divisionHistory: [{ category: "Open" }], shoutouts: ["injected"] };
    const merged = mergeMemoryUpdate(filledMemory(), hostile, "2026-03-15T09:00:00.000Z");
    expect(merged.divisionHistory).toEqual([{ category: "U14", from: "U12", to: "U14", date: "2026-01-01" }]);
    expect(merged.shoutouts).toEqual(["Great fight out there!"]);
  });

  it("re-applies every cap", () => {
    const overflowing = {
      milestones: Array.from({ length: 15 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, text: `m-${i}` })),
      standingConstraints: Array.from({ length: 9 }, (_, i) => `c-${i}`),
    };
    const merged = mergeMemoryUpdate(emptyMemory(), overflowing, "2026-03-15T09:00:00.000Z");
    expect(merged.milestones).toHaveLength(12);
    expect(merged.standingConstraints).toHaveLength(6);
  });

  it("keeps the current memory when the model returned nothing usable", () => {
    const merged = mergeMemoryUpdate(filledMemory(), null, "2026-03-15T09:00:00.000Z");
    expect(merged.narrative).toBe("A counter-puncher learning to attack short balls.");
    expect(merged.shoutouts).toEqual(["Great fight out there!"]);
  });

  it("is pure — does not mutate the current memory", () => {
    const current = filledMemory();
    const snapshot = JSON.parse(JSON.stringify(current));
    mergeMemoryUpdate(current, parsed, "2026-03-15T09:00:00.000Z");
    expect(current).toEqual(snapshot);
  });

  it("stamps updatedAt from the clock when no nowIso is given", () => {
    const merged = mergeMemoryUpdate(emptyMemory(), parsed);
    expect(typeof merged.updatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(merged.updatedAt))).toBe(false);
  });
});

// Why this module is split from athleteMemory.js: src/firebase.js calls
// getAuth() at import time, which throws auth/invalid-api-key wherever the
// VITE_FIREBASE_* vars are absent. CI passes those to the build step only, so
// a test that transitively imports firebase passes locally (a .env supplies
// them) and fails in CI. This guard catches that before a push does.
// It follows static `from "..."` imports, dynamic `import("...")`, and bare
// side-effect `import "..."` statements, relative specifiers only.
describe("test suite stays free of Firebase", () => {
  const LIB = path.resolve("src/lib");
  const FIREBASE = path.resolve("src/firebase.js");

  const importsOf = (file) => {
    if (!fs.existsSync(file)) return [];
    const src = fs.readFileSync(file, "utf8");
    const relOnly = (matches) => matches.map(m => m[1]).filter(s => s.startsWith("."));
    return [
      ...relOnly([...src.matchAll(/from\s+["']([^"']+)["']/g)]),
      ...relOnly([...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)]),
      ...relOnly([...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)]),
    ];
  };
  const resolveSpec = (from, spec) => {
    const base = path.resolve(path.dirname(from), spec);
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    for (const ext of [".js", ".jsx"]) if (fs.existsSync(base + ext)) return base + ext;
    return null;
  };
  const reachesFirebase = (entry) => {
    const seen = new Set(); const stack = [entry];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (cur === FIREBASE) return true;
      for (const s of importsOf(cur)) {
        const r = resolveSpec(cur, s);
        if (r) stack.push(r);
      }
    }
    return false;
  };

  const testFiles = fs.readdirSync(LIB).filter(f => f.endsWith(".test.js"));

  it("finds the test files it is meant to guard", () => {
    expect(testFiles.length).toBeGreaterThan(5);
  });

  it.each(testFiles)("%s does not transitively import src/firebase.js", (f) => {
    expect(reachesFirebase(path.join(LIB, f))).toBe(false);
  });
});
