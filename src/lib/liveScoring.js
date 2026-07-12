// ─── LIVE SCORING ENGINE ──────────────────────────────────────────────────────
// Pure tennis scoring state machine for courtside point-by-point tracking.
// The point log is the single source of truth: the scoreboard, server rotation,
// break points and stats are all derived by folding over it, and undo is simply
// dropping the last entry (mirroring how plist.js reconstructs imported matches
// from their matchLog). Emitted log entries use the exact MatchTrack field names
// and codes so extractMatchData() can build the canonical match doc unchanged.
import { extractMatchData } from "./plist.js";

export const FORMATS = {
  "bo3":     { label: "Best of 3 sets",          setsToWin: 2, gamesPerSet: 6, tbAt: 6, tbTarget: 7, finalSetSuperTb: false, forcedNoAd: false },
  "bo3-stb": { label: "Best of 3 · 10-pt 3rd",   setsToWin: 2, gamesPerSet: 6, tbAt: 6, tbTarget: 7, finalSetSuperTb: true,  forcedNoAd: false },
  "set1":    { label: "Single set",              setsToWin: 1, gamesPerSet: 6, tbAt: 6, tbTarget: 7, finalSetSuperTb: false, forcedNoAd: false },
  "fast4":   { label: "Fast4 (4-game sets)",     setsToWin: 2, gamesPerSet: 4, tbAt: 3, tbTarget: 7, finalSetSuperTb: false, forcedNoAd: true  },
  "pro8":    { label: "8-game pro set",          setsToWin: 1, gamesPerSet: 8, tbAt: 8, tbTarget: 7, finalSetSuperTb: false, forcedNoAd: false },
};

// Shot codes match MatchTrack; plist.js resolveShotField buckets them (drop
// shots to their own field, lob/inside-out/passing shot onto the base wing).
export const SHOT_TYPES = [
  { code: "fh",    label: "FH drive"  },
  { code: "bh",    label: "BH drive"  },
  { code: "fhS",   label: "FH slice"  },
  { code: "bhS",   label: "BH slice"  },
  { code: "fhV",   label: "FH volley" },
  { code: "bhV",   label: "BH volley" },
  { code: "fhR",   label: "FH return" },
  { code: "bhR",   label: "BH return" },
  { code: "fhOH",  label: "Overhead"  },
  { code: "fhA",   label: "Approach"  },
  { code: "fhDS",  label: "FH drop"   },
  { code: "bhDS",  label: "BH drop"   },
  { code: "fhIO",  label: "FH in-out" },
  { code: "fhPS",  label: "FH pass"   },
  { code: "bhPS",  label: "BH pass"   },
  { code: "fhLOB", label: "FH lob"    },
  { code: "bhLOB", label: "BH lob"    },
];

// Placement options shared with the capture UI. Keys are semantic; codes are
// MatchTrack's shotLocation tokens (direction cc/dtl/m, miss n/w/l).
export const DIRECTIONS = [
  { key: "crosscourt", code: "cc",  label: "Crosscourt" },
  { key: "downLine",   code: "dtl", label: "Down the line" },
  { key: "middle",     code: "m",   label: "Middle" },
];
export const MISSES = [
  { key: "net",  code: "n", label: "Net" },
  { key: "wide", code: "w", label: "Wide" },
  { key: "long", code: "l", label: "Long" },
];

// Builds a MatchTrack shotLocation code from a { direction, miss } selection.
function buildLocationCode(location) {
  if (!location) return null;
  const dir = DIRECTIONS.find(d => d.key === location.direction)?.code ?? "";
  const miss = MISSES.find(m => m.key === location.miss)?.code
    ?? (location.miss === "body" ? "b" : "");
  const body = dir + miss;
  return body ? `-${body}` : null;
}

const other = (p) => (p === 1 ? 2 : 1);

export function createMatch(config = {}) {
  const format = FORMATS[config.format] ? config.format : "bo3";
  return {
    config: {
      format,
      noAd: !!config.noAd || FORMATS[format].forcedNoAd,
      firstServer: config.firstServer === 2 ? 2 : 1,
      valissaName: config.valissaName || "Valissa",
      opponentName: config.opponentName || "Opponent",
      mode: config.mode === "detailed" ? "detailed" : "quick",
      startedAt: config.startedAt || new Date().toISOString(),
    },
    log: [],
  };
}

const gameWon = (winnerPts, loserPts, noAd) =>
  winnerPts >= 4 && winnerPts - loserPts >= (noAd ? 1 : 2);

// Derives the full score picture (and per-point snapshots) from the log.
export function deriveScore(config, log) {
  const fmt = FORMATS[config.format];
  const noAd = !!config.noAd || fmt.forcedNoAd;
  const finalSetNumber = fmt.setsToWin * 2 - 1;

  const sets = { p1: [], p2: [] };
  let setNumber = 1;
  let games = { p1: 0, p2: 0 };
  let pts = { p1: 0, p2: 0 };
  let gamesCompletedTotal = 0; // across the whole match — drives serve rotation
  let matchOver = false;
  let winner = null;
  const snapshots = [];

  const isSuperTbSet = () => fmt.finalSetSuperTb && setNumber === finalSetNumber;
  const inTiebreak = () => isSuperTbSet() || (games.p1 === fmt.tbAt && games.p2 === fmt.tbAt);
  const tbTarget = () => (isSuperTbSet() ? 10 : fmt.tbTarget);

  const currentServer = () => {
    const gameOpener = gamesCompletedTotal % 2 === 0 ? config.firstServer : other(config.firstServer);
    if (!inTiebreak()) return gameOpener;
    // Tiebreak rotation: opener serves point 1, then two points each.
    const i = pts.p1 + pts.p2;
    return ((i + 1) >> 1) % 2 === 0 ? gameOpener : other(gameOpener);
  };

  // Break point on the upcoming point (never in a tiebreak — those are set points).
  const currentBreakPoint = () => {
    if (matchOver || inTiebreak()) return false;
    const server = currentServer();
    const r = server === 1 ? pts.p2 : pts.p1;
    const s = server === 1 ? pts.p1 : pts.p2;
    return gameWon(r + 1, s, noAd);
  };

  const setKey = (p) => (p === 1 ? "p1" : "p2");

  const recordSetResult = (gP1, gP2) => {
    sets.p1.push(gP1);
    sets.p2.push(gP2);
    const won = gP1 > gP2 ? 1 : 2;
    if (sets.p1.filter((g, i) => g > sets.p2[i]).length === fmt.setsToWin) { matchOver = true; winner = 1; }
    if (sets.p2.filter((g, i) => g > sets.p1[i]).length === fmt.setsToWin) { matchOver = true; winner = 2; }
    if (!matchOver) { setNumber += 1; games = { p1: 0, p2: 0 }; }
    return won;
  };

  for (const pt of log) {
    const pointWinner = parseInt(pt.whoWonPoint, 10);
    const pre = {
      setNumber,
      gameNumber: games.p1 + games.p2 + 1,
      server: currentServer(),
      breakPoint: currentBreakPoint(),
      superTb: isSuperTbSet(),
      tiebreak: inTiebreak(),
    };
    const setsBefore = sets.p1.length;
    const gamesBefore = gamesCompletedTotal;

    if (matchOver || (pointWinner !== 1 && pointWinner !== 2)) {
      snapshots.push({ ...pre, ignored: true });
      continue;
    }

    const w = setKey(pointWinner);
    let entrySetGames; // games in the point's own set, after the point

    if (pre.tiebreak) {
      pts[w] += 1;
      const wPts = pts[w], lPts = pts[setKey(other(pointWinner))];
      if (wPts >= tbTarget() && wPts - lPts >= 2) {
        gamesCompletedTotal += 1;
        if (pre.superTb) {
          // Super tiebreak recorded as a set scored in TB points (e.g. 10-7).
          entrySetGames = { p1: pts.p1, p2: pts.p2 };
          recordSetResult(pts.p1, pts.p2);
        } else {
          games[w] += 1; // 7-6
          entrySetGames = { ...games };
          recordSetResult(games.p1, games.p2);
        }
        pts = { p1: 0, p2: 0 };
      } else {
        entrySetGames = pre.superTb ? { p1: pts.p1, p2: pts.p2 } : { ...games };
      }
    } else {
      pts[w] += 1;
      if (gameWon(pts[w], pts[setKey(other(pointWinner))], noAd)) {
        games[w] += 1;
        gamesCompletedTotal += 1;
        pts = { p1: 0, p2: 0 };
        entrySetGames = { ...games };
        const gW = games[w], gL = games[setKey(other(pointWinner))];
        if (gW >= fmt.gamesPerSet && gW - gL >= 2) recordSetResult(games.p1, games.p2);
      } else {
        entrySetGames = { ...games };
      }
    }

    snapshots.push({
      ...pre,
      postPts: { ...pts },
      postGamesInSet: entrySetGames,
      gameEnded: gamesCompletedTotal > gamesBefore,
      setEnded: sets.p1.length > setsBefore,
      matchEnded: matchOver,
    });
  }

  const superTb = isSuperTbSet();
  const tiebreak = !matchOver && inTiebreak();
  return {
    sets,
    setsWon: {
      p1: sets.p1.filter((g, i) => g > sets.p2[i]).length,
      p2: sets.p2.filter((g, i) => g > sets.p1[i]).length,
    },
    setNumber,
    games: { ...games },
    pts: { ...pts },
    display: pointsDisplay(pts, tiebreak, noAd),
    inTiebreak: tiebreak,
    isSuperTb: superTb && !matchOver,
    server: matchOver ? null : currentServer(),
    breakPoint: currentBreakPoint(),
    decidingPoint: !matchOver && !tiebreak && noAd && pts.p1 === 3 && pts.p2 === 3,
    matchOver,
    winner,
    gamesCompletedTotal,
    snapshots,
  };
}

function pointsDisplay(pts, tiebreak, noAd) {
  if (tiebreak) return { p1: String(pts.p1), p2: String(pts.p2) };
  const LABELS = ["0", "15", "30", "40"];
  const { p1, p2 } = pts;
  if (p1 >= 3 && p2 >= 3) {
    if (p1 === p2) return { p1: "40", p2: "40" };
    if (noAd) return { p1: "40", p2: "40" }; // deciding point — never reached past deuce
    return p1 > p2 ? { p1: "Ad", p2: "40" } : { p1: "40", p2: "Ad" };
  }
  return { p1: LABELS[Math.min(p1, 3)], p2: LABELS[Math.min(p2, 3)] };
}

export const scoreboard = (state) => deriveScore(state.config, state.log);

// input: { winner: 1|2, serve: 1|2, outcome: "ace"|"svcW"|"df"|"w"|"ufE"|"fE"|null,
//          shot: SHOT_TYPES code|null, rallyLength: number|null,
//          location: { direction?: DIRECTIONS.key, miss?: MISSES.key|"body" }|null }
export function recordPoint(state, input) {
  const before = deriveScore(state.config, state.log);
  if (before.matchOver) throw new Error("match-over");

  const server = before.server;
  const returner = other(server);
  const outcome = input.outcome ?? null;

  let winner = input.winner;
  if (outcome === "ace" || outcome === "svcW") winner = server;
  if (outcome === "df") winner = returner;
  if (winner !== 1 && winner !== 2) throw new Error("winner-required");

  let pointWonType = null, pointShotType = null, whoHitShot = null, rallyLength = input.rallyLength ?? null;
  if (outcome === "ace" || outcome === "svcW") {
    pointWonType = "w"; pointShotType = "svcW"; whoHitShot = String(server);
    if (rallyLength == null) rallyLength = 1;
  } else if (outcome === "df") {
    pointWonType = "df"; whoHitShot = String(server);
    if (rallyLength == null) rallyLength = 0;
  } else if (outcome === "w") {
    pointWonType = "w"; pointShotType = input.shot ?? null; whoHitShot = String(winner);
  } else if (outcome === "ufE" || outcome === "fE") {
    pointWonType = outcome; pointShotType = input.shot ?? null; whoHitShot = String(other(winner));
  }

  const entry = {
    pointNumber: state.log.length + 1,
    setNumber: before.setNumber,
    gameNumber: before.games.p1 + before.games.p2 + 1,
    rallyLength,
    whoHitShot,
    whoWonPoint: String(winner),   // strings — downstream consumers use loose equality
    whoServed: String(server),
    pointShotType,
    pointWonType,
    errorType: null,
    shotLocation: buildLocationCode(input.location),
    serveType: outcome === "df" ? 2 : (input.serve === 2 ? 2 : 1),
    breakPoint: before.breakPoint ? 1 : 0,
    pointTime: new Date().toISOString(),
    pOneName: state.config.valissaName,
    pTwoName: state.config.opponentName,
    outcome, // engine-only (stripped by extractMatchData); distinguishes aces from service winners
  };

  const after = deriveScore(state.config, [...state.log, entry]);
  const snap = after.snapshots[after.snapshots.length - 1];
  const full = {
    ...entry,
    gameEndedOnPoint: snap.gameEnded ? 1 : 0,
    setEndedOnPoint: snap.setEnded ? 1 : 0,
    matchEndedOnPoint: snap.matchEnded ? 1 : 0,
    pOneGameScore: snap.postPts.p1,
    pTwoGameScore: snap.postPts.p2,
    pOneSetScore: snap.postGamesInSet.p1,
    pTwoSetScore: snap.postGamesInSet.p2,
  };
  return { ...state, log: [...state.log, full] };
}

export const undo = (state) => ({ ...state, log: state.log.slice(0, -1) });

// Running stats for the live UI. Pass setNumber to get a single set's slice.
export function liveStats(state, { setNumber = null } = {}) {
  const points = setNumber == null ? state.log : state.log.filter(p => p.setNumber === setNumber);
  const mk = () => ({
    firstIn: 0, serveTotal: 0, firstWon: 0, secondTotal: 0, secondWon: 0,
    aces: 0, doubleFaults: 0, winners: 0, unforcedErrors: 0, forcedErrors: 0,
    bpChances: 0, bpConverted: 0, bpFaced: 0, bpSaved: 0, pointsWon: 0,
  });
  const stats = { p1: mk(), p2: mk() };

  for (const pt of points) {
    const server = parseInt(pt.whoServed, 10);
    const winner = parseInt(pt.whoWonPoint, 10);
    if (server !== 1 && server !== 2) continue;
    const sv = server === 1 ? stats.p1 : stats.p2;
    const rt = server === 1 ? stats.p2 : stats.p1;
    const serverWon = winner === server;

    (winner === 1 ? stats.p1 : stats.p2).pointsWon += 1;
    sv.serveTotal += 1;
    if (pt.serveType === 2) {
      sv.secondTotal += 1;
      if (pt.pointWonType === "df") sv.doubleFaults += 1;
      else if (serverWon) sv.secondWon += 1;
    } else {
      sv.firstIn += 1;
      if (serverWon) sv.firstWon += 1;
    }
    if (pt.outcome === "ace") sv.aces += 1;
    if (pt.breakPoint === 1) {
      sv.bpFaced += 1;
      rt.bpChances += 1;
      if (serverWon) sv.bpSaved += 1;
      else rt.bpConverted += 1;
    }
    const hitter = pt.whoHitShot === "1" ? stats.p1 : pt.whoHitShot === "2" ? stats.p2 : null;
    if (hitter) {
      if (pt.pointWonType === "w") hitter.winners += 1;
      else if (pt.pointWonType === "ufE") hitter.unforcedErrors += 1;
      else if (pt.pointWonType === "fE") hitter.forcedErrors += 1;
    }
  }

  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);
  for (const p of [stats.p1, stats.p2]) {
    p.firstServePct = pct(p.firstIn, p.serveTotal);
    p.firstWonPct = pct(p.firstWon, p.firstIn);
    p.secondWonPct = pct(p.secondWon, p.secondTotal);
  }
  return {
    ...stats,
    momentum: state.log.slice(-10).map(p => parseInt(p.whoWonPoint, 10)),
  };
}

// Builds the canonical match doc — the same shape ImportSheet saves — by feeding
// the live log through extractMatchData's reconstruct-from-log path.
export function finalizeMatch(state, { durationMin = null, winner = null } = {}) {
  const score = deriveScore(state.config, state.log);
  let whoWon = winner ?? score.winner;
  if (whoWon == null) {
    // Ended early with no explicit winner — leader by sets, then games, then points.
    const stats = liveStats(state);
    whoWon =
      score.setsWon.p1 !== score.setsWon.p2 ? (score.setsWon.p1 > score.setsWon.p2 ? 1 : 2)
      : score.games.p1 !== score.games.p2 ? (score.games.p1 > score.games.p2 ? 1 : 2)
      : stats.p2.pointsWon > stats.p1.pointsWon ? 2 : 1;
  }

  const plistShaped = {
    id: String(Date.now()),
    matchStartTime: state.config.startedAt,
    season: new Date(state.config.startedAt).getFullYear(),
    whoWonMatch: whoWon,
    players: [], // absent stats → extractMatchData reconstructs everything from the log
    matchLog: state.log,
  };
  const matchData = extractMatchData(plistShaped);

  // The reconstruct-from-log path can't tell aces from service winners (the
  // MatchTrack format doesn't distinguish them) — the engine can.
  const stats = liveStats(state);
  matchData.valissa.aces = stats.p1.aces;
  matchData.opponent.aces = stats.p2.aces;

  return {
    ...matchData,
    source: "live",
    mode: state.config.mode,
    durationMin,
  };
}
