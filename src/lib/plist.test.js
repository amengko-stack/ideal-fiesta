import { describe, it, expect } from "vitest";
import { extractMatchData, resolveShotField, parseShotLocation } from "./plist.js";

// extractMatchData is pure (no DOMParser); with an empty players array it takes
// the reconstruct-from-log path, exactly like a live-scored match.

const pt = (o) => ({
  pointNumber: o.n, setNumber: 1, gameNumber: 1, rallyLength: o.rally ?? 4,
  whoServed: String(o.server ?? 1), whoHitShot: o.hitter, whoWonPoint: String(o.won),
  serveType: o.serveType ?? 1, pointWonType: o.wonType, pointShotType: o.shot ?? null,
  shotLocation: o.loc ?? null, breakPoint: 0,
  pOneName: "Valissa", pTwoName: "Rival",
});

const build = (points) => extractMatchData({
  id: "T1", matchStartTime: "2026-07-10T09:00:00Z", season: 2026, whoWonMatch: 1,
  players: [], matchLog: points,
});

describe("resolveShotField", () => {
  it("maps known buckets", () => {
    expect(resolveShotField("fh")).toBe("fh");
    expect(resolveShotField("bhS")).toBe("bhSlice");
    expect(resolveShotField("fhV")).toBe("fhVolley");
    expect(resolveShotField("bhA")).toBe("approach");
    expect(resolveShotField("fhOH")).toBe("overhead");
  });
  it("maps drop shots to their own bucket", () => {
    expect(resolveShotField("fhDS")).toBe("dropShot");
    expect(resolveShotField("bhDS")).toBe("dropShot");
  });
  it("falls back unknown variants to the base wing (like MatchTrack)", () => {
    expect(resolveShotField("fhPS")).toBe("fh");   // passing shot
    expect(resolveShotField("fhLOB")).toBe("fh");  // lob
    expect(resolveShotField("fhIO")).toBe("fh");   // inside-out
    expect(resolveShotField("bhLOB")).toBe("bh");
    expect(resolveShotField("bhXYZ")).toBe("bh");  // unforeseen
  });
  it("returns null for empties and non-wing codes", () => {
    expect(resolveShotField(null)).toBeNull();
    expect(resolveShotField("")).toBeNull();
    expect(resolveShotField("svcW")).toBeNull();
  });
});

describe("parseShotLocation", () => {
  it("parses winner directions (no miss)", () => {
    expect(parseShotLocation("-cc")).toEqual({ direction: "crosscourt", miss: null });
    expect(parseShotLocation("-dtl")).toEqual({ direction: "downLine", miss: null });
    expect(parseShotLocation("-m")).toEqual({ direction: "middle", miss: null });
  });
  it("parses direction + miss for errors", () => {
    expect(parseShotLocation("-ccn")).toEqual({ direction: "crosscourt", miss: "net" });
    expect(parseShotLocation("-ccw")).toEqual({ direction: "crosscourt", miss: "wide" });
    expect(parseShotLocation("-ccl")).toEqual({ direction: "crosscourt", miss: "long" });
    expect(parseShotLocation("-dtlw")).toEqual({ direction: "downLine", miss: "wide" });
    expect(parseShotLocation("-dtln")).toEqual({ direction: "downLine", miss: "net" });
    expect(parseShotLocation("-ml")).toEqual({ direction: "middle", miss: "long" });
    expect(parseShotLocation("-mn")).toEqual({ direction: "middle", miss: "net" });
  });
  it("parses bare misses (direction untagged) and serve codes", () => {
    expect(parseShotLocation("-n")).toEqual({ direction: null, miss: "net" });
    expect(parseShotLocation("-w")).toEqual({ direction: null, miss: "wide" });
    expect(parseShotLocation("-l")).toEqual({ direction: null, miss: "long" });
    expect(parseShotLocation("-b")).toEqual({ direction: null, miss: "body" });
  });
  it("handles empties", () => {
    expect(parseShotLocation("")).toEqual({ direction: null, miss: null });
    expect(parseShotLocation(null)).toEqual({ direction: null, miss: null });
  });
});

describe("dropShot reconstruction", () => {
  it("credits drop-shot winners and errors to their bucket", () => {
    const doc = build([
      pt({ n: 1, hitter: 2, won: 2, wonType: "w", shot: "fhDS" }),   // opponent DS winner
      pt({ n: 2, hitter: 2, won: 2, wonType: "w", shot: "bhDS" }),   // opponent DS winner
      pt({ n: 3, hitter: 1, won: 2, wonType: "ufE", shot: "fhDS" }), // Valissa DS error
    ]);
    expect(doc.opponent.dropShotWinner).toBe(2);
    expect(doc.opponent.winners).toBe(2);
    expect(doc.valissa.dropShotError).toBe(1);
  });

  it("counts unmapped variants on the base wing instead of losing them", () => {
    const doc = build([
      pt({ n: 1, hitter: 1, won: 1, wonType: "w", shot: "fhPS" }),  // passing shot
      pt({ n: 2, hitter: 1, won: 1, wonType: "w", shot: "fhLOB" }), // lob
      pt({ n: 3, hitter: 1, won: 1, wonType: "w", shot: "fh" }),
    ]);
    expect(doc.valissa.winners).toBe(3);
    expect(doc.valissa.fhWinner).toBe(3); // all three attributed to the forehand
  });
});

describe("placement aggregation", () => {
  it("buckets winners by direction and errors by miss/direction", () => {
    const doc = build([
      pt({ n: 1, hitter: 1, won: 1, wonType: "w",   shot: "fh", loc: "-cc" }),
      pt({ n: 2, hitter: 1, won: 1, wonType: "w",   shot: "fh", loc: "-cc" }),
      pt({ n: 3, hitter: 1, won: 1, wonType: "w",   shot: "bh", loc: "-dtl" }),
      pt({ n: 4, hitter: 1, won: 2, wonType: "ufE", shot: "bh", loc: "-dtlw" }),
      pt({ n: 5, hitter: 1, won: 2, wonType: "ufE", shot: "fh", loc: "-n" }),
      pt({ n: 6, hitter: 2, won: 1, wonType: "ufE", shot: "fh", loc: "-ccl" }),
    ]);
    const p = doc.calculated.placement;
    expect(p.p1.winnersByDirection).toEqual({ crosscourt: 2, downLine: 1, middle: 0 });
    expect(p.p1.errorsByMiss).toEqual({ net: 1, wide: 1, long: 0 });
    expect(p.p1.errorsByDirection).toEqual({ crosscourt: 0, downLine: 1, middle: 0 });
    expect(p.p2.errorsByMiss).toEqual({ net: 0, wide: 0, long: 1 });
    expect(p.p2.errorsByDirection).toEqual({ crosscourt: 1, downLine: 0, middle: 0 });
  });

  it("buckets serve placement from service winners and double faults", () => {
    const doc = build([
      pt({ n: 1, hitter: 1, won: 1, wonType: "svcW", shot: "svcW", loc: "-b" }),
      pt({ n: 2, hitter: 1, won: 1, wonType: "svcW", shot: "svcW", loc: "-w" }),
      pt({ n: 3, hitter: 1, won: 2, wonType: "df",   serveType: 2, loc: "-n" }),
    ]);
    expect(doc.calculated.placement.p1.serve).toEqual({ body: 1, wide: 1, net: 1, long: 0 });
  });

  it("leaves placement all-zero when no location data (quick mode / old imports)", () => {
    const doc = build([
      pt({ n: 1, hitter: 1, won: 1, wonType: "w", shot: "fh" }),
      pt({ n: 2, hitter: 1, won: 1, wonType: "w", shot: "fh" }),
    ]);
    const p = doc.calculated.placement.p1;
    const total = Object.values(p.winnersByDirection).reduce((a, b) => a + b, 0)
      + Object.values(p.errorsByMiss).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });
});
