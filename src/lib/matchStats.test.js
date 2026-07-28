import { describe, it, expect } from "vitest";
import {
  computeMatchStats, statsFromAggregates, formatStat, shotGroupTotal,
  MATCH_STAT_ROWS, SHOT_GROUPS,
} from "./matchStats.js";

// Builds a MatchTrack-shaped point. Defaults describe a plain 1st-serve rally
// won by p1 off a forehand winner.
const pt = (o = {}) => ({
  whoServed: String(o.server ?? 1),
  whoWonPoint: String(o.won ?? 1),
  whoHitShot: o.hitter != null ? String(o.hitter) : String(o.won ?? 1),
  serveType: o.serveType ?? 1,
  pointWonType: o.type ?? "w",
  pointShotType: o.shot ?? "fh",
  rallyLength: o.rally ?? 3,
  breakPoint: o.bp ? 1 : 0,
  ...(o.outcome ? { outcome: o.outcome } : {}),
});

describe("serve stats", () => {
  it("computes 1st serve % over all service points", () => {
    const s = computeMatchStats([
      pt({ serveType: 1 }), pt({ serveType: 1 }), pt({ serveType: 1 }),
      pt({ serveType: 2 }),
    ]);
    expect(s.p1.firstIn).toBe(3);
    expect(s.p1.firstAttempts).toBe(4);
    expect(s.p1.firstServePct).toBe(75);
  });

  it("2nd serve % excludes double faults (serves made, not points won)", () => {
    const s = computeMatchStats([
      pt({ serveType: 2 }), pt({ serveType: 2 }),
      pt({ serveType: 2, won: 2, type: "df" }),
      pt({ serveType: 2, won: 2, type: "df" }),
    ]);
    expect(s.p1.secondPts).toBe(4);
    expect(s.p1.doubleFaults).toBe(2);
    expect(s.p1.secondServePct).toBe(50);
  });

  it("counts service winners apart from rally winners", () => {
    const s = computeMatchStats([
      pt({ shot: "fh" }),
      pt({ type: "svcW", shot: "svcW" }),
      pt({ type: "svcW", shot: "svcW", outcome: "ace" }),
    ]);
    expect(s.p1.winners).toBe(1);          // service winners excluded
    expect(s.p1.serviceWinners).toBe(2);
    expect(s.p1.totalWinners).toBe(3);
    expect(s.p1.aces).toBe(1);             // live logs mark aces explicitly
  });

  it("takes stored ace counts for imported logs that don't mark them", () => {
    const log = [pt({ type: "svcW", shot: "svcW" })];
    expect(computeMatchStats(log).p1.aces).toBe(0);
    expect(computeMatchStats(log, { aces: { p1: 4, p2: 1 } }).p1.aces).toBe(4);
  });
});

describe("return and break points", () => {
  it("counts every second serve as a return point — a double fault is one won", () => {
    const s = computeMatchStats([
      pt({ server: 1, won: 2, serveType: 1 }),          // p2 wins a 1st-serve return
      pt({ server: 1, won: 1, serveType: 1 }),
      pt({ server: 1, won: 2, serveType: 2 }),          // p2 wins a 2nd-serve return
      pt({ server: 1, won: 2, serveType: 2, type: "df" }), // DF counts too
    ]);
    expect(s.p2.firstReturnPts).toBe(2);
    expect(s.p2.firstReturnWon).toBe(1);
    expect(s.p2.secondReturnPts).toBe(2);
    expect(s.p2.secondReturnWon).toBe(2);
  });

  it("tracks live-engine break points from the breakPoint flag", () => {
    const s = computeMatchStats([
      pt({ server: 1, won: 2, bp: true }),  // broken
      pt({ server: 1, won: 1, bp: true }),  // saved
    ]);
    expect(s.p1.bpFaced).toBe(2);
    expect(s.p1.bpSaved).toBe(1);
    expect(s.p2.bpChances).toBe(2);
    expect(s.p2.bpConverted).toBe(1);
  });

  it("uses MatchTrack's explicit saved/won flags when present", () => {
    // Imported logs carry these flags; their own `breakPoint` field is
    // unreliable, so it must be ignored when the flags exist.
    const mt = (o) => ({ ...pt(o), breakPoint: 0, breakPointSaved: o.saved ?? 0, breakPointWon: o.bpWon ?? 0 });
    const s = computeMatchStats([
      mt({ server: 1, won: 1, saved: 1 }),
      mt({ server: 1, won: 1, saved: 1 }),
      mt({ server: 1, won: 2, bpWon: 1 }),
      mt({ server: 2, won: 2, saved: 1 }),
    ]);
    expect(s.p1.bpSaved).toBe(2);
    expect(s.p1.bpFaced).toBe(3);      // 2 saved + 1 conceded
    expect(s.p2.bpConverted).toBe(1);
    expect(s.p2.bpChances).toBe(3);    // 1 converted + 2 the opponent saved
    expect(s.p2.bpSaved).toBe(1);
    expect(s.p2.bpFaced).toBe(1);
  });
});

describe("points and touches", () => {
  it("buckets rally length for whoever won the point", () => {
    const s = computeMatchStats([
      pt({ won: 1, rally: 2 }), pt({ won: 1, rally: 4 }),
      pt({ won: 2, rally: 7 }), pt({ won: 2, rally: 17 }),
    ]);
    expect(s.p1.touches).toEqual({ "0-4": 2, "5-8": 0, "9+": 0 });
    expect(s.p2.touches).toEqual({ "0-4": 0, "5-8": 1, "9+": 1 });
    expect(s.totalPoints).toBe(4);
    expect(s.p1.pointsWonPct).toBe(50);
  });
});

describe("shot breakdown", () => {
  it("splits forced and unforced errors per shot type", () => {
    const s = computeMatchStats([
      pt({ won: 2, hitter: 1, type: "ufE", shot: "bh" }),
      pt({ won: 2, hitter: 1, type: "ufE", shot: "bh" }),
      pt({ won: 2, hitter: 1, type: "fE", shot: "bh" }),
      pt({ won: 1, hitter: 1, type: "w", shot: "bh" }),
    ]);
    expect(s.p1.byShot.unforced.bh).toBe(2);
    expect(s.p1.byShot.forced.bh).toBe(1);
    expect(s.p1.byShot.winners.bh).toBe(1);
    expect(s.p1.unforcedErrors).toBe(2);
    expect(s.p1.forcedErrors).toBe(1);
  });

  it("keeps granular shot types apart and groups approach/drop shot", () => {
    const s = computeMatchStats([
      pt({ shot: "fhIO" }), pt({ shot: "fhPS" }), pt({ shot: "fh" }),
      pt({ shot: "fhA" }), pt({ shot: "bhA" }),
      pt({ shot: "fhDS" }), pt({ shot: "bhDS" }),
    ]);
    expect(s.p1.byShot.winners.fhIO).toBe(1);   // not folded into fh
    expect(s.p1.byShot.winners.fhPS).toBe(1);
    expect(s.p1.byShot.winners.fh).toBe(1);
    const group = (key) => SHOT_GROUPS.find(g => g.key === key);
    expect(shotGroupTotal(s.p1, group("approach"), "winners")).toBe(2); // fhA + bhA
    expect(shotGroupTotal(s.p1, group("dropShot"), "winners")).toBe(2);
    expect(shotGroupTotal(s.p1, group("fh"), "winners")).toBe(1);
  });
});

// ─── fixture: the real Valissa vs Nakhla match ────────────────────────────────
// Reconstructed from the actual .matchtrack export, asserting the exact values
// MatchTrack's own screens show for that match.
describe("real match fixture (Valissa vs Nakhla, 3 Jul 2026)", () => {
  // Synthesises a log with the same distribution as the real export.
  const log = [];
  let n = 0;
  const push = (o) => log.push({ ...pt(o), pointNumber: ++n });
  const many = (count, o) => { for (let i = 0; i < count; i++) push(o); };

  // ── serve: p1 31 first serves in (15 won), 20 second (6 won, 6 DF)
  many(15, { server: 1, won: 1, serveType: 1, type: "w", shot: "fh", hitter: 1 });
  many(16, { server: 1, won: 2, serveType: 1, type: "ufE", shot: "fh", hitter: 1 });
  many(6,  { server: 1, won: 1, serveType: 2, type: "w", shot: "bh", hitter: 1 });
  many(8,  { server: 1, won: 2, serveType: 2, type: "ufE", shot: "bh", hitter: 1 });
  many(6,  { server: 1, won: 2, serveType: 2, type: "df" });
  // ── p2 serve: 51 first (32 won), 17 second (8 won, 2 DF)
  many(32, { server: 2, won: 2, serveType: 1, type: "w", shot: "fh", hitter: 2 });
  many(19, { server: 2, won: 1, serveType: 1, type: "ufE", shot: "fh", hitter: 2 });
  many(8,  { server: 2, won: 2, serveType: 2, type: "w", shot: "bh", hitter: 2 });
  many(7,  { server: 2, won: 1, serveType: 2, type: "ufE", shot: "bh", hitter: 2 });
  many(2,  { server: 2, won: 1, serveType: 2, type: "df" });

  const s = computeMatchStats(log);

  it("reproduces the serve percentages from the screenshots", () => {
    expect(s.p1.firstServePct).toBe(60.8);   // 31/51
    expect(s.p2.firstServePct).toBe(75);     // 51/68
    expect(s.p1.secondServePct).toBe(70);    // (20-6)/20
    expect(s.p2.secondServePct).toBe(88.2);  // (17-2)/17
  });

  it("reproduces serve points won and double faults", () => {
    expect({ n: s.p1.firstWon, d: s.p1.firstIn }).toEqual({ n: 15, d: 31 });
    expect({ n: s.p2.firstWon, d: s.p2.firstIn }).toEqual({ n: 32, d: 51 });
    expect({ n: s.p1.secondWon, d: s.p1.secondPts }).toEqual({ n: 6, d: 20 });
    expect({ n: s.p2.secondWon, d: s.p2.secondPts }).toEqual({ n: 8, d: 17 });
    expect(s.p1.doubleFaults).toBe(6);
    expect(s.p2.doubleFaults).toBe(2);
  });

  it("reproduces the total points split", () => {
    expect(s.p1.totalWon).toBe(49);
    expect(s.p2.totalWon).toBe(70);
    expect(s.totalPoints).toBe(119);
    expect(s.p1.pointsWonPct).toBe(41.2);
    expect(s.p2.pointsWonPct).toBe(58.8);
  });

  it("reproduces return points (mirror of the server's numbers)", () => {
    expect({ n: s.p1.firstReturnWon, d: s.p1.firstReturnPts }).toEqual({ n: 19, d: 51 });
    expect({ n: s.p2.firstReturnWon, d: s.p2.firstReturnPts }).toEqual({ n: 16, d: 31 });
    // Second-serve returns include the opponent's double faults: 17 = 15 + 2 DF
    expect({ n: s.p1.secondReturnWon, d: s.p1.secondReturnPts }).toEqual({ n: 9, d: 17 });
    expect({ n: s.p2.secondReturnWon, d: s.p2.secondReturnPts }).toEqual({ n: 14, d: 20 });
  });

  it("reproduces break points from MatchTrack's flags", () => {
    // The real export's flags: Valissa saved 4 / converted 2, Nakhla saved 9 / converted 6.
    const bp = (o) => ({ ...pt(o), breakPointSaved: o.saved ?? 0, breakPointWon: o.bpWon ?? 0 });
    const bpLog = [
      ...Array.from({ length: 4 }, () => bp({ server: 1, won: 1, saved: 1 })),
      ...Array.from({ length: 6 }, () => bp({ server: 1, won: 2, bpWon: 1 })),
      ...Array.from({ length: 9 }, () => bp({ server: 2, won: 2, saved: 1 })),
      ...Array.from({ length: 2 }, () => bp({ server: 2, won: 1, bpWon: 1 })),
    ];
    const b = computeMatchStats(bpLog);
    expect({ n: b.p1.bpSaved, d: b.p1.bpFaced }).toEqual({ n: 4, d: 10 });
    expect({ n: b.p2.bpSaved, d: b.p2.bpFaced }).toEqual({ n: 9, d: 11 });
    expect({ n: b.p1.bpConverted, d: b.p1.bpChances }).toEqual({ n: 2, d: 11 });
    expect({ n: b.p2.bpConverted, d: b.p2.bpChances }).toEqual({ n: 6, d: 10 });
  });
});

describe("presentation helpers", () => {
  it("formats each row kind", () => {
    expect(formatStat("pct", 60.8)).toBe("60.8%");
    expect(formatStat("pct", null)).toBe("—");
    expect(formatStat("count", 6)).toBe("6");
    expect(formatStat("frac", { n: 15, d: 31 })).toBe("15/31 (48.4%)");
    expect(formatStat("frac", { n: 0, d: 0 })).toBe("0/0");
  });

  it("exposes all MatchTrack rows in order", () => {
    expect(MATCH_STAT_ROWS[0].label).toBe("1st Serve %");
    expect(MATCH_STAT_ROWS.at(-1).label).toBe("9+ Touches");
    expect(MATCH_STAT_ROWS).toHaveLength(20);
    const s = computeMatchStats([pt({})]);
    for (const row of MATCH_STAT_ROWS) {
      expect(() => formatStat(row.kind, row.get(s.p1))).not.toThrow();
    }
  });
});

describe("statsFromAggregates fallback", () => {
  it("maps stored stats for log-less legacy matches", () => {
    const out = statsFromAggregates({
      valissa: { firstServePct: 62.5, firstServePoints: 40, firstServePointsWon: 28, secondServePoints: 24, doubleFaults: 4, winners: 18, unforcedErrors: 12, breakPoints: 7, breakPointsWon: 4 },
      opponent: { firstServePoints: 30, firstServePointsWon: 20, winners: 9 },
    });
    expect(out.hasLog).toBe(false);
    expect(out.p1.firstServePct).toBe(62.5);
    expect(out.p1.winners).toBe(18);
    expect(out.p1.bpConverted).toBe(4);
    expect(out.p1.totalWon).toBeNull();     // not derivable without a log
    expect(out.p1.touches).toEqual({ "0-4": 0, "5-8": 0, "9+": 0 });
  });

  it("survives an empty match doc", () => {
    expect(() => statsFromAggregates({})).not.toThrow();
    expect(() => statsFromAggregates(null)).not.toThrow();
  });
});
