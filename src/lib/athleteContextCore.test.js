import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { assembleAthleteContext, selectRecentMatch } from "./athleteContextCore.js";

// Frozen so the 28/14/7-day cutoffs and getWeekBounds land on known dates.
const NOW_ISO = "2026-03-15T09:00:00.000Z";   // a Sunday
const now = () => new Date(NOW_ISO);

const rawBundle = (over = {}) => ({
  athleteUid: "athlete-1",
  weekLogs: [
    { id: "l1", date: "2026-03-09", type: "tennis", duration: 90, rpe: 7 },   // this week
    { id: "l2", date: "2026-03-11", type: "tennis", duration: 60, rpe: 6 },   // this week
    { id: "l3", date: "2026-03-04", type: "tennis", duration: 60, rpe: 5 },   // last week
    { id: "l4", date: "2026-01-02", type: "tennis", duration: 90, rpe: 8 },   // outside 28d
  ],
  wellbeing: [
    { id: "w1", date: "2026-03-14", sleep: 6, mood: 2, soreness: 3 },
    { id: "w2", date: "2026-03-13", sleep: 6.5, mood: 2, soreness: 2 },
    { id: "w3", date: "2026-03-12", sleep: 8, mood: 2, soreness: 1 },
    { id: "w4", date: "2026-02-01", sleep: 9, mood: 5, soreness: 1 },         // outside 7d
  ],
  tournaments: [
    { id: "t1", date: "2026-03-20", name: "Regional" },
    { id: "t2", date: "2026-03-08", name: "Club open" },
  ],
  tournamentStatusDoc: null,
  lastStrengthSession: {
    date: "2026-03-08",
    exercises: [{ name: "Goblet Squat", sets: 3, reps: 10, difficulty: 3, completed: true }],
  },
  profile: {
    name: "Valissa", dob: "2013-05-04", competitionCategory: "U14",
    gaps: ["first_serve"], height: 154, weight: 41, sittingHeight: 80,
    measurements: [{ date: "2026-03-01", height: 154, weight: 41, sittingHeight: 80 }],
  },
  matches: [
    { id: "m1", athleteId: "athlete-1", matchStartTime: "2026-03-07T02:00:00.000Z", opponentName: "Kirana", whoWonMatch: 1 },
    { id: "m2", athleteId: "athlete-1", matchStartTime: "2026-01-07T02:00:00.000Z", opponentName: "Old", whoWonMatch: 0 },
    { id: "m3", athleteId: "someone-else", matchStartTime: "2026-03-10T02:00:00.000Z", opponentName: "NotHers", whoWonMatch: 1 },
  ],
  matchAnalysisDoc: {
    criticalFindings: [{ finding: "Second serve sat up", priority: "critical" }],
    deferredPriorities: [{ priority: "Second serve under pressure" }],
  },
  deferredDocs: [
    { id: "d1", status: "active", priority: "Second serve under pressure", key: "second_serve", weeksDeferredCount: 3 },
    { id: "d2", status: "resolved", priority: "Old thing", key: "drop_shot" },
    { id: "d3", status: "escalated", priority: "Escalated thing", key: "net_play" },
  ],
  technicalAssessments: [
    { strokeArea: "Serve", category: "Technical", date: "2026-03-02", source: "video", assessment: "Toss drifts.", priority: "Medium" },
    { strokeArea: "Backhand", category: "Technical", date: "2026-02-20", source: "coach", assessment: "Late prep.", priority: "High" },
    { strokeArea: "Footwork", category: "Physical", date: "2026-02-10", source: "coach", assessment: "Slow split.", priority: "Monitor" },
  ],
  memoryDoc: {
    narrative: "A counter-puncher learning to attack.",
    trajectory: "", persistentPatterns: [], whatWorked: [], whatDidNotWork: [],
    milestones: [], standingConstraints: [], divisionHistory: [], shoutouts: [],
  },
  seasonReportDoc: { nextMonthPriority: "Attack short balls.", longTermOutlook: "Aggressive baseliner." },
  injuries: [
    { id: "i1", status: "open", bodyArea: "Ankle", side: "Right", severity: 3, onsetDate: "2026-03-09" },
  ],
  ...over,
});

describe("assembleAthleteContext — load section", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW_ISO)); });
  afterAll(() => vi.useRealTimers());

  it("cuts logs at 28 days and attaches sRPE to each surviving session", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.sessionLogs.sessions.map(s => s.id)).toEqual(["l1", "l2", "l3"]);
    expect(ctx.sessionLogs.sessions[0].srpe).toBe(630);   // 7 × 90
    expect(ctx.sessionLogs.sessions[1].srpe).toBe(360);   // 6 × 60
  });

  it("reports this week's sRPE, the 4-week average and ACWR", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.sessionLogs.thisWeekSrpe).toBe(990);       // 630 + 360
    expect(ctx.sessionLogs.fourWeekAvgSrpe).toBe(323);    // round((990 + 300 + 0 + 0) / 4)
    expect(ctx.sessionLogs.acwr).toBeCloseTo(3.07, 2);
  });

  it("derives sRPE from intensity when rpe is absent", () => {
    const ctx = assembleAthleteContext(
      rawBundle({ weekLogs: [{ id: "x", date: "2026-03-09", type: "tennis", duration: 60, intensity: 4 }] }),
      now(),
    );
    expect(ctx.sessionLogs.sessions[0].srpe).toBe(480);   // (4 × 2) × 60
  });
});

describe("assembleAthleteContext — wellbeing section", () => {
  it("averages only the last 7 days, to two decimals", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.wellbeing.entries.map(e => e.id)).toEqual(["w1", "w2", "w3"]);
    expect(ctx.wellbeing.avgSleepHours).toBe(6.83);       // (6 + 6.5 + 8) / 3
    expect(ctx.wellbeing.avgMood).toBe(2);
    expect(ctx.wellbeing.avgSoreness).toBe(2);
  });

  it("raises lowMoodFlag on 3 consecutive days under 2.5", () => {
    expect(assembleAthleteContext(rawBundle(), now()).wellbeing.lowMoodFlag).toBe(true);
  });

  it("clears lowMoodFlag when a good day breaks the run", () => {
    const raw = rawBundle();
    raw.wellbeing[1] = { ...raw.wellbeing[1], mood: 4 };
    expect(assembleAthleteContext(raw, now()).wellbeing.lowMoodFlag).toBe(false);
  });

  it("raises lowSleepFlag only at 5 short nights", () => {
    const short = (d) => ({ id: d, date: d, sleep: 6, mood: 4 });
    const raw = rawBundle({
      wellbeing: ["2026-03-14", "2026-03-13", "2026-03-12", "2026-03-11"].map(short),
    });
    expect(assembleAthleteContext(raw, now()).wellbeing.lowSleepFlag).toBe(false);
    raw.wellbeing.push(short("2026-03-10"));
    expect(assembleAthleteContext(raw, now()).wellbeing.lowSleepFlag).toBe(true);
  });

  it("reads moodAM/moodPM and sorenessAM/sorenessPM fallbacks", () => {
    const raw = rawBundle({ wellbeing: [{ id: "w", date: "2026-03-14", moodAM: 5, sorenessPM: 4 }] });
    const ctx = assembleAthleteContext(raw, now());
    expect(ctx.wellbeing.avgMood).toBe(5);
    expect(ctx.wellbeing.avgSoreness).toBe(4);
  });

  it("returns nulls rather than NaN with no check-ins", () => {
    const ctx = assembleAthleteContext(rawBundle({ wellbeing: [] }), now());
    expect(ctx.wellbeing.avgSleepHours).toBeNull();
    expect(ctx.wellbeing.avgMood).toBeNull();
    expect(ctx.wellbeing.avgSoreness).toBeNull();
  });
});

describe("assembleAthleteContext — tournament proximity", () => {
  it("measures days to the nearest upcoming and since the last played", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.tournamentStatus).toEqual({
      hasUpcomingTournament: true,
      daysUntilTournament: 5,
      playedTournamentRecently: true,
      daysSinceTournament: 7,
    });
  });

  it("drops playedTournamentRecently past 14 days", () => {
    const raw = rawBundle({ tournaments: [{ id: "t", date: "2026-02-01" }] });
    const ctx = assembleAthleteContext(raw, now());
    expect(ctx.tournamentStatus.hasUpcomingTournament).toBe(false);
    expect(ctx.tournamentStatus.playedTournamentRecently).toBe(false);
    expect(ctx.tournamentStatus.daysSinceTournament).toBe(42);
  });

  it("falls back to the legacy config doc when there are no tournament docs", () => {
    const raw = rawBundle({
      tournaments: [],
      tournamentStatusDoc: { upcomingTournamentDate: "2026-03-25", lastTournamentDate: "2026-03-10" },
    });
    const ctx = assembleAthleteContext(raw, now());
    expect(ctx.tournamentStatus.hasUpcomingTournament).toBe(true);
    expect(ctx.tournamentStatus.daysUntilTournament).toBe(10);
    expect(ctx.tournamentStatus.playedTournamentRecently).toBe(true);
  });

  it("keeps the defaults when the tournaments read failed (null)", () => {
    const ctx = assembleAthleteContext(rawBundle({ tournaments: null }), now());
    expect(ctx.tournamentStatus).toEqual({
      hasUpcomingTournament: false,
      daysUntilTournament: null,
      playedTournamentRecently: false,
      daysSinceTournament: null,
    });
  });
});

describe("assembleAthleteContext — profile, maturity and identity", () => {
  it("renders the identity block with the maturation line appended", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.athleteProfile.name).toBe("Valissa");
    expect(ctx.athleteProfile.age).toBe(12);
    expect(ctx.athleteProfile.categoryLabel).toBe("Under-14");
    expect(ctx.athleteProfile.isPlayingUp).toBe(true);
    expect(ctx.athleteProfile.maturityLine).toContain("Maturation: Mid-PHV");
    expect(ctx.athleteProfile.identityText).toContain("ATHLETE: Valissa · female · age 12");
    expect(ctx.athleteProfile.identityText).toContain("Maturation: Mid-PHV");
  });

  it("omits the maturation line when no measurement carries a sitting height", () => {
    const raw = rawBundle();
    raw.profile = { ...raw.profile, measurements: [{ date: "2026-03-01", height: 154, weight: 41 }] };
    const ctx = assembleAthleteContext(raw, now());
    expect(ctx.athleteProfile.maturityLine).toBeNull();
    expect(ctx.athleteProfile.identityText).not.toContain("Maturation:");
  });

  it("leaves athleteProfile null when there is no profile doc", () => {
    expect(assembleAthleteContext(rawBundle({ profile: null }), now()).athleteProfile).toBeNull();
  });
});

describe("assembleAthleteContext — matches, priorities and assessments", () => {
  it("picks this athlete's most recent match inside 14 days", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.recentMatch.id).toBe("m1");
    expect(ctx.matchAnalysis.criticalFindings).toHaveLength(1);
    expect(ctx.matchAnalysis.deferredPriorities).toHaveLength(1);
  });

  it("degrades to empty findings when the analysis doc is missing", () => {
    const ctx = assembleAthleteContext(rawBundle({ matchAnalysisDoc: null }), now());
    expect(ctx.matchAnalysis).toEqual({ criticalFindings: [], deferredPriorities: [] });
  });

  it("projects only the active deferred priorities", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.deferredPriorities).toHaveLength(1);
    expect(ctx.deferredPriorities[0]).toEqual({
      priority: "Second serve under pressure",
      key: "second_serve",
      reason: null,
      deferredDate: null,
      resolveCondition: null,
      metricTarget: null,
      weeksDeferredCount: 3,
    });
  });

  it("keeps the 3 most relevant High/Medium technical assessments, High first", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.technicalAssessments.map(a => a.priority)).toEqual(["High", "Medium"]);
    expect(ctx.technicalAssessments[0].strokeArea).toBe("Backhand");
  });

  it("degrades to an empty list when the assessments read failed", () => {
    expect(assembleAthleteContext(rawBundle({ technicalAssessments: null }), now()).technicalAssessments).toEqual([]);
  });
});

describe("assembleAthleteContext — memory and season priority", () => {
  it("renders the memory block from the memory doc", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.memoryText).toContain("ATHLETE DEVELOPMENT MEMORY:");
    expect(ctx.memoryText).toContain("A counter-puncher learning to attack.");
  });

  it("renders an empty memory block for an empty memory", () => {
    const ctx = assembleAthleteContext(rawBundle({ memoryDoc: null }), now());
    expect(ctx.memoryText).toBe("");
    expect(ctx.memory).toBeNull();
  });

  it("surfaces only nextMonthPriority and longTermOutlook from the season report", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.standingSeasonPriority).toEqual({
      nextMonthPriority: "Attack short balls.",
      longTermOutlook: "Aggressive baseliner.",
    });
  });

  it("stays null when the season report has neither field", () => {
    const raw = rawBundle({ seasonReportDoc: { matchCount: 12 } });
    expect(assembleAthleteContext(raw, now()).standingSeasonPriority).toBeNull();
  });
});

describe("assembleAthleteContext — injury text", () => {
  it("renders open injuries with duration and the load guidance", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.injuryText).toBe([
      "OPEN INJURIES:",
      "- Ankle (Right): severity 3/5, open 6 days",
      "- Guidance: Avoid loading the affected area and drop overall volume until it settles.",
    ].join("\n"));
    expect(ctx.injuries.open).toHaveLength(1);
    expect(ctx.injuries.flag.tone).toBe("warn");
  });

  it("omits the side when it is N/A", () => {
    const raw = rawBundle({ injuries: [{ id: "i", status: "open", bodyArea: "Lower back", side: "N/A", severity: 1, onsetDate: "2026-03-14" }] });
    expect(assembleAthleteContext(raw, now()).injuryText).toContain("- Lower back: severity 1/5, open 1 days");
  });

  it("renders nothing at all when there is nothing open or recurring", () => {
    const ctx = assembleAthleteContext(rawBundle({ injuries: [] }), now());
    expect(ctx.injuryText).toBe("");
    expect(ctx.injuries).toBeNull();
  });

  it("degrades quietly when the injuries read failed", () => {
    const ctx = assembleAthleteContext(rawBundle({ injuries: null }), now());
    expect(ctx.injuryText).toBe("");
    expect(ctx.injuries).toBeNull();
  });
});

describe("assembleAthleteContext — shape and robustness", () => {
  it("returns every key the consumers read", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(Object.keys(ctx).sort()).toEqual([
      "athleteUid", "deferredPriorities", "generatedAt", "injuries", "injuryText",
      "lastStrengthSession", "matchAnalysis", "memory", "memoryText", "recentMatch",
      "sessionLogs", "standingSeasonPriority", "technicalAssessments",
      "tournamentStatus", "wellbeing", "athleteProfile",
    ].sort());
    expect(ctx.generatedAt).toBe(NOW_ISO);
    expect(ctx.athleteUid).toBe("athlete-1");
  });

  it("maps the last strength session onto the reporting shape", () => {
    const ctx = assembleAthleteContext(rawBundle(), now());
    expect(ctx.lastStrengthSession).toEqual({
      date: "2026-03-08",
      exercises: [{
        name: "Goblet Squat", setsCompleted: 3, repsCompleted: 10,
        difficultyRating: 3, completed: true,
      }],
    });
  });

  it("survives a completely empty bundle", () => {
    const ctx = assembleAthleteContext({}, now());
    expect(ctx.sessionLogs.sessions).toEqual([]);
    expect(ctx.sessionLogs.acwr).toBeNull();
    expect(ctx.recentMatch).toBeNull();
    expect(ctx.athleteProfile).toBeNull();
    expect(ctx.deferredPriorities).toEqual([]);
    expect(ctx.injuryText).toBe("");
  });

  it("survives null", () => {
    expect(() => assembleAthleteContext(null, now())).not.toThrow();
  });
});

describe("selectRecentMatch", () => {
  it("returns the newest of this athlete's matches inside 14 days", () => {
    const m = selectRecentMatch(rawBundle().matches, "athlete-1", now());
    expect(m.id).toBe("m1");
  });

  it("ignores other athletes' matches", () => {
    const m = selectRecentMatch(rawBundle().matches, "someone-else", now());
    expect(m.id).toBe("m3");
  });

  it("returns null when nothing is recent", () => {
    expect(selectRecentMatch([{ id: "old", athleteId: "athlete-1", matchStartTime: "2025-01-01T00:00:00.000Z" }], "athlete-1", now())).toBeNull();
    expect(selectRecentMatch([], "athlete-1", now())).toBeNull();
    expect(selectRecentMatch(null, "athlete-1", now())).toBeNull();
  });
});
