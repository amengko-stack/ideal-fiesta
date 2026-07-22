import { describe, it, expect } from "vitest";
import { createMatch, recordPoint, undo, scoreboard, liveStats, finalizeMatch, FORMATS, stepBackPending } from "./liveScoring.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

const point = (state, winner, extra = {}) => recordPoint(state, { winner, serve: 1, ...extra });

// Win one ordinary game (or 4 tiebreak points) for `winner`.
const winGame = (state, winner, n = 4) => {
  for (let i = 0; i < n; i++) state = point(state, winner);
  return state;
};

const winSet = (state, winner) => {
  for (let i = 0; i < 6; i++) state = winGame(state, winner);
  return state;
};

// ─── basic game scoring ───────────────────────────────────────────────────────

describe("game scoring", () => {
  it("starts at 0-0 with the configured first server", () => {
    const sb = scoreboard(createMatch({ firstServer: 2 }));
    expect(sb.display).toEqual({ p1: "0", p2: "0" });
    expect(sb.games).toEqual({ p1: 0, p2: 0 });
    expect(sb.server).toBe(2);
    expect(sb.matchOver).toBe(false);
  });

  it("walks 0 → 15 → 30 → 40 → game and alternates server", () => {
    let s = createMatch({});
    s = point(s, 1);
    expect(scoreboard(s).display.p1).toBe("15");
    s = point(s, 1);
    expect(scoreboard(s).display.p1).toBe("30");
    s = point(s, 1);
    expect(scoreboard(s).display.p1).toBe("40");
    s = point(s, 1);
    const sb = scoreboard(s);
    expect(sb.games).toEqual({ p1: 1, p2: 0 });
    expect(sb.display).toEqual({ p1: "0", p2: "0" });
    expect(sb.server).toBe(2); // next game
  });

  it("plays deuce/advantage: win by two", () => {
    let s = createMatch({});
    for (const w of [1, 1, 1, 2, 2, 2]) s = point(s, w); // deuce
    expect(scoreboard(s).display).toEqual({ p1: "40", p2: "40" });
    s = point(s, 1);
    expect(scoreboard(s).display).toEqual({ p1: "Ad", p2: "40" });
    s = point(s, 2); // back to deuce
    expect(scoreboard(s).display).toEqual({ p1: "40", p2: "40" });
    s = point(s, 2);
    s = point(s, 2);
    expect(scoreboard(s).games).toEqual({ p1: 0, p2: 1 });
  });

  it("no-ad: deciding point at deuce wins the game", () => {
    let s = createMatch({ noAd: true });
    for (const w of [1, 1, 1, 2, 2, 2]) s = point(s, w); // deuce
    expect(scoreboard(s).decidingPoint).toBe(true);
    s = point(s, 2);
    expect(scoreboard(s).games).toEqual({ p1: 0, p2: 1 });
  });
});

// ─── break points ─────────────────────────────────────────────────────────────

describe("break points", () => {
  it("flags returner game point on serve as a break point", () => {
    let s = createMatch({ firstServer: 2 }); // opponent serves first
    s = point(s, 1); s = point(s, 1); s = point(s, 1); // 0-40
    expect(scoreboard(s).breakPoint).toBe(true);
    s = point(s, 1); // break converted
    expect(s.log[3].breakPoint).toBe(1);
    expect(s.log[2].breakPoint).toBe(0); // 0-30 point was not a BP
    const st = liveStats(s);
    expect(st.p1.bpChances).toBe(1);
    expect(st.p1.bpConverted).toBe(1);
    expect(st.p2.bpFaced).toBe(1);
    expect(st.p2.bpSaved).toBe(0);
  });

  it("no-ad deciding point on opponent serve is a break point", () => {
    let s = createMatch({ firstServer: 2, noAd: true });
    for (const w of [1, 1, 1, 2, 2, 2]) s = point(s, w);
    expect(scoreboard(s).breakPoint).toBe(true);
  });
});

// ─── tiebreaks and sets ───────────────────────────────────────────────────────

describe("sets and tiebreaks", () => {
  it("wins a set 6-0 and starts the next set", () => {
    let s = createMatch({});
    s = winSet(s, 1);
    const sb = scoreboard(s);
    expect(sb.sets.p1).toEqual([6]);
    expect(sb.sets.p2).toEqual([0]);
    expect(sb.setNumber).toBe(2);
  });

  it("plays a 7-point tiebreak at 6-6 with correct serve rotation", () => {
    let s = createMatch({ firstServer: 1 });
    for (let g = 0; g < 6; g++) { s = winGame(s, 1); s = winGame(s, 2); }
    let sb = scoreboard(s);
    expect(sb.games).toEqual({ p1: 6, p2: 6 });
    expect(sb.inTiebreak).toBe(true);
    // 12 games played → game 13 opener is firstServer(1); then 2-point rotation
    expect(sb.server).toBe(1);
    s = point(s, 1);
    expect(scoreboard(s).server).toBe(2);
    s = point(s, 1);
    expect(scoreboard(s).server).toBe(2);
    s = point(s, 1);
    expect(scoreboard(s).server).toBe(1);
    expect(scoreboard(s).display).toEqual({ p1: "3", p2: "0" });
    for (let i = 0; i < 4; i++) s = point(s, 1); // 7-0
    sb = scoreboard(s);
    expect(sb.sets.p1).toEqual([7]);
    expect(sb.sets.p2).toEqual([6]);
    expect(sb.setNumber).toBe(2);
    // TB counted as one game (13 total) → set 2 opens with the other player
    expect(sb.server).toBe(2);
  });

  it("tiebreak requires win by two", () => {
    let s = createMatch({});
    for (let g = 0; g < 6; g++) { s = winGame(s, 1); s = winGame(s, 2); }
    for (let i = 0; i < 6; i++) { s = point(s, 1); s = point(s, 2); } // 6-6
    s = point(s, 1); // 7-6 — not over
    expect(scoreboard(s).inTiebreak).toBe(true);
    s = point(s, 1); // 8-6 — set over
    expect(scoreboard(s).sets.p1).toEqual([7]);
    expect(scoreboard(s).sets.p2).toEqual([6]);
  });
});

// ─── match formats ────────────────────────────────────────────────────────────

describe("match formats", () => {
  it("bo3: two sets wins the match; further points throw", () => {
    let s = createMatch({ format: "bo3" });
    s = winSet(s, 1);
    s = winSet(s, 1);
    const sb = scoreboard(s);
    expect(sb.matchOver).toBe(true);
    expect(sb.winner).toBe(1);
    expect(s.log[s.log.length - 1].matchEndedOnPoint).toBe(1);
    expect(() => point(s, 1)).toThrow("match-over");
  });

  it("bo3-stb: third set is a 10-point super tiebreak recorded in points", () => {
    let s = createMatch({ format: "bo3-stb" });
    s = winSet(s, 1);
    s = winSet(s, 2);
    expect(scoreboard(s).isSuperTb).toBe(true);
    for (let i = 0; i < 10; i++) s = point(s, 2);
    const sb = scoreboard(s);
    expect(sb.matchOver).toBe(true);
    expect(sb.winner).toBe(2);
    expect(sb.sets.p1).toEqual([6, 0, 0]);
    expect(sb.sets.p2).toEqual([0, 6, 10]);
  });

  it("fast4: 4-game sets with a tiebreak at 3-3, no-ad forced", () => {
    let s = createMatch({ format: "fast4" });
    expect(s.config.noAd).toBe(true);
    for (let g = 0; g < 3; g++) { s = winGame(s, 1); s = winGame(s, 2); }
    expect(scoreboard(s).inTiebreak).toBe(true);
    for (let i = 0; i < 7; i++) s = point(s, 1);
    const sb = scoreboard(s);
    expect(sb.sets.p1).toEqual([4]);
    expect(sb.sets.p2).toEqual([3]);
  });

  it("pro8: single 8-game set", () => {
    let s = createMatch({ format: "pro8" });
    for (let g = 0; g < 8; g++) s = winGame(s, 1);
    const sb = scoreboard(s);
    expect(sb.matchOver).toBe(true);
    expect(sb.sets.p1).toEqual([8]);
  });
});

// ─── undo ─────────────────────────────────────────────────────────────────────

describe("undo", () => {
  it("drops the last point and re-derives the score", () => {
    let s = createMatch({});
    s = point(s, 1);
    s = point(s, 1);
    const before = scoreboard(s);
    s = point(s, 2);
    s = undo(s);
    expect(scoreboard(s)).toEqual(before);
    expect(s.log).toHaveLength(2);
  });

  it("can undo a game-winning point", () => {
    let s = createMatch({});
    s = winGame(s, 1);
    s = undo(s);
    const sb = scoreboard(s);
    expect(sb.games).toEqual({ p1: 0, p2: 0 });
    expect(sb.display).toEqual({ p1: "40", p2: "0" });
  });
});

// ─── MatchTrack log format ────────────────────────────────────────────────────

describe("log entries (MatchTrack format)", () => {
  it("stamps score snapshots and flags after each point", () => {
    let s = createMatch({ opponentName: "Rival" });
    s = winGame(s, 1);
    const last = s.log[3];
    expect(last.gameEndedOnPoint).toBe(1);
    expect(last.setEndedOnPoint).toBe(0);
    expect(last.pOneSetScore).toBe(1);
    expect(last.pTwoSetScore).toBe(0);
    expect(last.pOneGameScore).toBe(0); // reset after game
    expect(last.whoWonPoint).toBe("1");
    expect(last.whoServed).toBe("1");
    expect(last.pOneName).toBe("Valissa");
    expect(last.pTwoName).toBe("Rival");
    expect(s.log[0].pointNumber).toBe(1);
    expect(s.log[0].setNumber).toBe(1);
    expect(s.log[0].gameNumber).toBe(1);
  });

  it("maps ace / double fault / errors to MatchTrack codes", () => {
    let s = createMatch({});
    s = recordPoint(s, { serve: 1, outcome: "ace" });
    expect(s.log[0]).toMatchObject({ pointWonType: "w", pointShotType: "svcW", whoWonPoint: "1", whoHitShot: "1", rallyLength: 1 });
    s = recordPoint(s, { serve: 2, outcome: "df" });
    expect(s.log[1]).toMatchObject({ pointWonType: "df", whoWonPoint: "2", whoHitShot: "1", serveType: 2 });
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "ufE", shot: "bh" });
    // opponent's unforced backhand error → opponent hit the shot
    expect(s.log[2]).toMatchObject({ pointWonType: "ufE", pointShotType: "bh", whoWonPoint: "1", whoHitShot: "2" });
    s = recordPoint(s, { winner: 2, serve: 1, outcome: "w", shot: "fhV", rallyLength: 6 });
    expect(s.log[3]).toMatchObject({ pointWonType: "w", pointShotType: "fhV", whoWonPoint: "2", whoHitShot: "2", rallyLength: 6 });
  });
});

// ─── live stats ───────────────────────────────────────────────────────────────

describe("liveStats", () => {
  it("tracks serve percentages and momentum", () => {
    let s = createMatch({});
    s = recordPoint(s, { serve: 1, outcome: "ace" });          // p1 1st serve, won
    s = recordPoint(s, { winner: 2, serve: 2 });               // p1 2nd serve, lost
    s = recordPoint(s, { serve: 2, outcome: "df" });           // p1 double fault
    const st = liveStats(s);
    expect(st.p1.serveTotal).toBe(3);
    expect(st.p1.firstIn).toBe(1);
    expect(st.p1.firstServePct).toBe(33);
    expect(st.p1.aces).toBe(1);
    expect(st.p1.doubleFaults).toBe(1);
    expect(st.momentum).toEqual([1, 2, 2]);
  });

  it("filters by set", () => {
    let s = createMatch({});
    s = winSet(s, 1);
    s = winGame(s, 2);
    expect(liveStats(s, { setNumber: 2 }).p2.pointsWon).toBe(4);
    expect(liveStats(s, { setNumber: 1 }).p1.pointsWon).toBe(24);
  });
});

// ─── finalize round trip ──────────────────────────────────────────────────────

describe("finalizeMatch", () => {
  it("produces the canonical match doc via extractMatchData", () => {
    let s = createMatch({ format: "set1", opponentName: "Rival", startedAt: "2026-07-10T09:00:00.000Z" });
    s = recordPoint(s, { serve: 1, outcome: "ace" });
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "w", shot: "fh", rallyLength: 3 });
    s = recordPoint(s, { winner: 1, serve: 2, outcome: "ufE", shot: "bh", rallyLength: 7 });
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "fE", shot: "bhS", rallyLength: 10 });
    for (let g = 0; g < 5; g++) s = winGame(s, 1); // first 4 points won game 1 → 6-0
    const doc = finalizeMatch(s, { durationMin: 47 });

    expect(doc.whoWonMatch).toBe(1);
    expect(doc.valissaName).toBe("Valissa");
    expect(doc.opponentName).toBe("Rival");
    expect(doc.setScores.p1).toEqual([6]);
    expect(doc.setScores.p2).toEqual([0]);
    expect(doc.source).toBe("live");
    expect(doc.durationMin).toBe(47);
    expect(doc.matchStartTime).toBe("2026-07-10T09:00:00.000Z");
    expect(typeof doc.matchId).toBe("string");

    // stats reconstructed from the log
    expect(doc.valissa.aces).toBe(1);          // engine overlay (svcW alone can't tell)
    expect(doc.valissa.winners).toBeGreaterThanOrEqual(1); // the fh winner (svcW excluded)
    expect(doc.valissa.fhWinner).toBe(1);
    expect(doc.opponent.unforcedErrors).toBe(1);
    expect(doc.opponent.bhError).toBe(1);
    expect(doc.opponent.forcedErrors).toBe(1);
    expect(doc.opponent.bhSliceError).toBe(1);
    expect(doc.valissa.firstServePct).toBeGreaterThan(0);

    // rally distribution buckets from tagged lengths (1,3 → 0-4; 7 → 5-8; 10 → 9+)
    expect(doc.calculated.rallyDistribution["0-4"].total).toBe(2);
    expect(doc.calculated.rallyDistribution["5-8"].total).toBe(1);
    expect(doc.calculated.rallyDistribution["9+"].total).toBe(1);
    expect(doc.calculated.rallyDistribution["9+"].valissaWinPct).toBe(100);
  });

  it("picks the leader when a match ends early", () => {
    let s = createMatch({ format: "bo3" });
    s = winSet(s, 2);
    const doc = finalizeMatch(s, {});
    expect(doc.whoWonMatch).toBe(2);
    const overridden = finalizeMatch(s, { winner: 1 }); // e.g. opponent retired
    expect(overridden.whoWonMatch).toBe(1);
  });
});

// ─── placement, drop shots & exact rally ──────────────────────────────────────

describe("placement capture", () => {
  it("emits MatchTrack shotLocation codes from a direction/miss selection", () => {
    let s = createMatch({ mode: "detailed" });
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "w", shot: "fh", location: { direction: "crosscourt" } });
    expect(s.log[0].shotLocation).toBe("-cc");
    s = recordPoint(s, { winner: 2, serve: 1, outcome: "ufE", shot: "bh", location: { direction: "downLine", miss: "wide" } });
    expect(s.log[1].shotLocation).toBe("-dtlw");
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "ufE", shot: "fh", location: { miss: "net" } });
    expect(s.log[2].shotLocation).toBe("-n");
    s = recordPoint(s, { serve: 2, outcome: "df", location: { miss: "long" } });
    expect(s.log[3].shotLocation).toBe("-l");
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "w", shot: "fh" }); // no location
    expect(s.log[4].shotLocation).toBeNull();
  });

  it("flows placement through finalize into calculated.placement", () => {
    let s = createMatch({ format: "set1", mode: "detailed" });
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "w",   shot: "fh", location: { direction: "crosscourt" } });
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "w",   shot: "bh", location: { direction: "downLine" } });
    s = recordPoint(s, { winner: 2, serve: 1, outcome: "ufE", shot: "bh", location: { direction: "crosscourt", miss: "long" } });
    const doc = finalizeMatch(s, {});
    expect(doc.calculated.placement.p1.winnersByDirection).toEqual({ crosscourt: 1, downLine: 1, middle: 0 });
    expect(doc.calculated.placement.p1.errorsByMiss).toEqual({ net: 0, wide: 0, long: 1 });
    expect(doc.calculated.placement.p1.errorsByDirection.crosscourt).toBe(1);
  });
});

describe("drop shots and exact rally", () => {
  it("credits a drop-shot winner to the dropShot bucket via finalize", () => {
    let s = createMatch({ format: "set1", mode: "detailed" });
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "w", shot: "fhDS", rallyLength: 8 });
    const doc = finalizeMatch(s, {});
    expect(doc.valissa.dropShotWinner).toBe(1);
    expect(doc.valissa.winners).toBe(1);
  });

  it("keeps the exact rally length the UI passes (not a bucket value)", () => {
    let s = createMatch({ mode: "detailed" });
    s = recordPoint(s, { winner: 1, serve: 1, outcome: "w", shot: "fh", rallyLength: 17 });
    expect(s.log[0].rallyLength).toBe(17);
    const doc = finalizeMatch(s, {});
    expect(doc.calculated.rallyDistribution["9+"].total).toBe(1);
  });
});

// ─── stepBackPending (one-tap Back) ───────────────────────────────────────────

describe("stepBackPending", () => {
  it("walks back one decision at a time through the reordered flow", () => {
    const full = { serve: 1, winner: 1, outcome: "w", rallyLength: 6, shot: "fh", locDraft: { miss: "net" } };
    const afterPlacement = stepBackPending(full);           // placement → shot
    expect(afterPlacement).toEqual({ serve: 1, winner: 1, outcome: "w", rallyLength: 6 });
    const afterShot = stepBackPending(afterPlacement);      // shot → rally
    expect(afterShot).toEqual({ serve: 1, winner: 1, outcome: "w" });
    const afterRally = stepBackPending(afterShot);          // rally → outcome
    expect(afterRally).toEqual({ serve: 1, winner: 1 });
    const afterOutcome = stepBackPending(afterRally);       // outcome → who won
    expect(afterOutcome).toEqual({ serve: 1 });
    expect(stepBackPending(afterOutcome)).toBeNull();       // who won → serve
  });

  it("treats skipped values (null) as answered and pops them", () => {
    expect(stepBackPending({ serve: 1, winner: 1, outcome: "ufE", rallyLength: null, shot: null }))
      .toEqual({ serve: 1, winner: 1, outcome: "ufE", rallyLength: null });
    expect(stepBackPending({ serve: 1, winner: 1, outcome: "ufE", rallyLength: null }))
      .toEqual({ serve: 1, winner: 1, outcome: "ufE" });
  });

  it("drops the placement draft when leaving the placement step", () => {
    const back = stepBackPending({ serve: 1, winner: 2, outcome: "fE", rallyLength: 3, shot: "bh", locDraft: { miss: "wide", direction: "downLine" } });
    expect(back.locDraft).toBeUndefined();
    expect("shot" in back).toBe(false);
  });

  it("returns null for one-tap sub-steps and empty pending", () => {
    expect(stepBackPending({ serve: 1, pickAceServe: true })).toBeNull();
    expect(stepBackPending({ serve: 2, outcome: "df" })).toBeNull();
    expect(stepBackPending({ serve: 1 })).toBeNull(); // quick-mode / just after serve
    expect(stepBackPending(null)).toBeNull();
  });

  it("does not mutate its input", () => {
    const p = { serve: 1, winner: 1, outcome: "w", rallyLength: 6, shot: "fh" };
    const copy = JSON.parse(JSON.stringify(p));
    stepBackPending(p);
    expect(p).toEqual(copy);
  });
});

// ─── formats table sanity ─────────────────────────────────────────────────────

describe("FORMATS", () => {
  it("exposes labels for the setup UI", () => {
    for (const f of Object.values(FORMATS)) expect(f.label).toBeTruthy();
  });
});
