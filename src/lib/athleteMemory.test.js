import { describe, it, expect } from "vitest";
import { emptyMemory, capMemory, memoryBlock, recordDivisionChange } from "./athleteMemory.js";

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
