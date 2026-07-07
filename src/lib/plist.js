// ─── PLIST PARSER ─────────────────────────────────────────────────────────────
function parsePlistNode(node) {
  const tag = node.tagName;
  if (tag === "dict") {
    const children = [...node.childNodes].filter(n => n.nodeType === 1);
    const obj = {};
    for (let i = 0; i < children.length - 1; i += 2) {
      const key = children[i].textContent.trim();
      obj[key] = parsePlistNode(children[i + 1]);
    }
    return obj;
  }
  if (tag === "array") {
    return [...node.childNodes].filter(n => n.nodeType === 1).map(parsePlistNode);
  }
  if (tag === "string")  return node.textContent;
  if (tag === "integer") return parseInt(node.textContent, 10);
  if (tag === "real")    return parseFloat(node.textContent);
  if (tag === "true")    return true;
  if (tag === "false")   return false;
  if (tag === "date")    return node.textContent.trim();
  return node.textContent;
}

export function parsePlist(xmlString) {
  if (xmlString.startsWith("bplist")) {
    throw new Error("binary-plist");
  }

  const xmlDoc = new DOMParser().parseFromString(xmlString, "text/xml");
  const parseErr = xmlDoc.querySelector("parsererror");
  if (parseErr) {
    console.error("[matchtrack] DOMParser error:", parseErr.textContent);
    throw new Error("xml-parse-error");
  }

  const plist = xmlDoc.querySelector("plist");
  if (!plist) {
    console.error("[matchtrack] no <plist> element found. Document element:", xmlDoc.documentElement?.tagName);
    throw new Error("no-plist-element");
  }

  const root = [...plist.childNodes].find(n => n.nodeType === 1);
  if (!root) {
    console.error("[matchtrack] plist has no child element nodes");
    throw new Error("empty-plist");
  }

  return parsePlistNode(root);
}

export function extractMatchData(plistObj) {
  const players  = plistObj.players ?? [];
  const { id, matchStartTime, season, whoWonMatch, matchLog = [] } = plistObj;

  // ─── CRITICAL FIX ────────────────────────────────────────────────────────────
  // The plist has 4 player objects. The outer playerNumber is NOT reliable.
  // Real stats are found by reading stats[last].playerNumber:
  //   stats[last].playerNumber === 1  →  Valissa's real cumulative stats
  //   stats[last].playerNumber === 2  →  Opponent's real cumulative stats
  // The player objects where outer playerNumber is 1 or 2 contain only zeros.
  // ─────────────────────────────────────────────────────────────────────────────
  const resolveStats = p => {
    const s = p.stats;
    if (Array.isArray(s) && s.length > 0) return s[s.length - 1];
    if (s && typeof s === "object") return s;
    return {};
  };

  // Detect if stats completely absent (addMatch format — all stats arrays empty)
  const totalActivity = players.reduce((sum, p) => {
    const s = resolveStats(p);
    return sum + (s.winners ?? 0) + (s.unforcedErrors ?? 0) + (s.forcedErrors ?? 0);
  }, 0);
  const statsCompletelyAbsent = totalActivity === 0;

  // Player names from matchLog are always reliable
  const firstPoint = matchLog[0] ?? {};
  const valissaName = firstPoint.pOneName ?? "Valissa";
  const opponentName = firstPoint.pTwoName ?? "Opponent";

  const STAT_FIELDS = [
    "aces", "doubleFaults", "firstServePct", "firstServePoints", "firstServePointsWon",
    "secondServePoints", "secondServePointsWon", "winners", "unforcedErrors", "forcedErrors",
    "breakPointsWon", "breakPoints", "breakPointsSaved", "breakPointsFaced",
    "firstReturnPoints", "firstReturnPointsWon", "secondReturnPoints", "secondReturnPointsWon",
    "deucePointsWon", "fhWinner", "fhError", "bhWinner", "bhError",
    "fhReturnWinner", "fhReturnError", "bhReturnWinner", "bhReturnError",
    "fhVolleyWinner", "fhVolleyError", "bhVolleyWinner", "bhVolleyError",
    "approachWinner", "approachError", "fhSliceWinner", "fhSliceError",
    "bhSliceWinner", "bhSliceError", "overheadWinner", "overheadError",
    "setOneScore", "setTwoScore", "setsWon",
  ];

  const POINT_FIELDS = [
    "pointNumber", "setNumber", "gameNumber", "rallyLength",
    "whoHitShot", "whoWonPoint", "whoServed", "pointShotType", "pointWonType",
    "errorType", "shotLocation", "serveType", "breakPoint",
    "gameEndedOnPoint", "setEndedOnPoint", "matchEndedOnPoint",
    "pOneGameScore", "pTwoGameScore", "pOneSetScore", "pTwoSetScore", "pointTime",
  ];

  const pickStatFields = (source, fields) => {
    const result = {};
    for (const f of fields) result[f] = (source ?? {})[f] ?? 0;
    return result;
  };
  const pickFields = (source, fields) => {
    const result = {};
    for (const f of fields) result[f] = (source ?? {})[f] ?? null;
    return result;
  };

  let p1Stats, p2Stats;

  if (statsCompletelyAbsent) {
    p1Stats = Object.fromEntries(STAT_FIELDS.map(f => [f, 0]));
    p2Stats = Object.fromEntries(STAT_FIELDS.map(f => [f, 0]));
  } else {
    const scoredPlayers = players.map(p => {
      const s = resolveStats(p);
      const activity = (s.winners ?? 0) + (s.unforcedErrors ?? 0) + (s.forcedErrors ?? 0);
      return { p, s, activity };
    }).sort((a, b) => b.activity - a.activity);

    let p1Raw = scoredPlayers[0]?.p ?? {};
    let p2Raw = scoredPlayers[1]?.p ?? {};

    const pTwoName = firstPoint.pTwoName ?? "";
    if (p1Raw.name && pTwoName && p1Raw.name === pTwoName) {
      [p1Raw, p2Raw] = [p2Raw, p1Raw];
    }

    p1Stats = pickStatFields(resolveStats(p1Raw), STAT_FIELDS);
    p2Stats = pickStatFields(resolveStats(p2Raw), STAT_FIELDS);
  }

  // Parse matchLog — whoWonPoint "1" = Valissa, "2" = opponent
  const points = matchLog
    .map(pt => pickFields(pt, POINT_FIELDS))
    .sort((a, b) => (a.pointNumber ?? 0) - (b.pointNumber ?? 0));

  // ─── COMPLETE STATS RECONSTRUCTION FROM MATCHLOG ─────────────────────────────
  // Runs for all matches. For absent-stats matches, provides all values.
  // For normal matches, fills in missing shot breakdown only.

  const SHOT_FIELD_MAP = {
    'fh': 'fh', 'fhS': 'fhSlice', 'fhV': 'fhVolley', 'fhR': 'fhReturn',
    'fhIO': 'fhIO', 'fhOH': 'overhead', 'fhA': 'approach',
    'bh': 'bh', 'bhS': 'bhSlice', 'bhV': 'bhVolley', 'bhR': 'bhReturn', 'bhA': 'approach',
  };
  const SVC_WINNER_SHOTS = new Set(['svcW', 'svcW-t', 'svcW-w']);

  // Initialize reconstruction accumulators
  const rec = {
    p1: { firstServeIn:0, firstServePointsWon:0, secondServePoints:0, secondServePointsWon:0,
      doubleFaults:0, serviceWinners:0, aces:0,
      breakPointsFaced:0, breakPointsSaved:0, breakPointsWon:0, breakPoints:0,
      firstReturnPoints:0, firstReturnPointsWon:0, secondReturnPoints:0, secondReturnPointsWon:0,
      winners:0, unforcedErrors:0, forcedErrors:0,
      fhWinner:0, fhError:0, bhWinner:0, bhError:0,
      fhSliceWinner:0, fhSliceError:0, fhVolleyWinner:0, fhVolleyError:0,
      fhReturnWinner:0, fhReturnError:0, fhIOWinner:0, fhIOError:0,
      overheadWinner:0, overheadError:0, approachWinner:0, approachError:0,
      bhSliceWinner:0, bhSliceError:0, bhVolleyWinner:0, bhVolleyError:0,
      bhReturnWinner:0, bhReturnError:0,
    },
    p2: { firstServeIn:0, firstServePointsWon:0, secondServePoints:0, secondServePointsWon:0,
      doubleFaults:0, serviceWinners:0, aces:0,
      breakPointsFaced:0, breakPointsSaved:0, breakPointsWon:0, breakPoints:0,
      firstReturnPoints:0, firstReturnPointsWon:0, secondReturnPoints:0, secondReturnPointsWon:0,
      winners:0, unforcedErrors:0, forcedErrors:0,
      fhWinner:0, fhError:0, bhWinner:0, bhError:0,
      fhSliceWinner:0, fhSliceError:0, fhVolleyWinner:0, fhVolleyError:0,
      fhReturnWinner:0, fhReturnError:0, fhIOWinner:0, fhIOError:0,
      overheadWinner:0, overheadError:0, approachWinner:0, approachError:0,
      bhSliceWinner:0, bhSliceError:0, bhVolleyWinner:0, bhVolleyError:0,
      bhReturnWinner:0, bhReturnError:0,
    }
  };

  for (const pt of points) {
    const whoServedRaw = pt.whoServed ?? pt.whoHitShot;
    const whoServedInt = parseInt(whoServedRaw, 10);
    if (whoServedInt !== 1 && whoServedInt !== 2) continue;
    const whoHit      = pt.whoHitShot;
    const whoWon      = pt.whoWonPoint;
    const serve       = parseInt(pt.serveType, 10);
    const wonType     = pt.pointWonType ?? '';
    const shot        = pt.pointShotType ?? '';
    const isP1Serving = whoServedInt === 1;
    const serverWon   = parseInt(whoWon, 10) === whoServedInt;
    const server      = isP1Serving ? rec.p1 : rec.p2;
    const returner    = isP1Serving ? rec.p2 : rec.p1;
    // eslint-disable-next-line eqeqeq
    const hitter      = whoHit == 1 ? rec.p1 : rec.p2;
    const field       = SHOT_FIELD_MAP[shot];
    // eslint-disable-next-line eqeqeq
    const isBreak     = pt.breakPoint == 1;

    // SERVICE STATS
    if (serve === 1) {
      server.firstServeIn += 1;
      if (serverWon) server.firstServePointsWon += 1;
      if (SVC_WINNER_SHOTS.has(shot)) server.serviceWinners += 1;
    } else if (serve === 2) {
      server.secondServePoints += 1;
      if (wonType === 'df') server.doubleFaults += 1;
      else if (serverWon) server.secondServePointsWon += 1;
    }

    // BREAK POINTS
    if (isBreak) {
      server.breakPointsFaced += 1;
      if (serverWon) server.breakPointsSaved += 1;
      returner.breakPoints += 1;
      if (!serverWon) returner.breakPointsWon += 1;
    }

    // RETURN STATS
    if (serve === 1) {
      returner.firstReturnPoints += 1;
      if (!serverWon) returner.firstReturnPointsWon += 1;
    } else if (serve === 2 && wonType !== 'df') {
      returner.secondReturnPoints += 1;
      if (!serverWon) returner.secondReturnPointsWon += 1;
    }

    // WINNERS AND ERRORS
    if (wonType === 'w' && !SVC_WINNER_SHOTS.has(shot)) {
      hitter.winners += 1;
      if (field) hitter[`${field}Winner`] += 1;
    } else if (wonType === 'ufE') {
      hitter.unforcedErrors += 1;
      if (field) hitter[`${field}Error`] += 1;
    } else if (wonType === 'fE') {
      hitter.forcedErrors += 1;
      if (field) hitter[`${field}Error`] += 1;
    }
  }

  // Calculate first serve %
  const p1TotalFirstAttempts = rec.p1.firstServeIn + rec.p1.secondServePoints;
  const p2TotalFirstAttempts = rec.p2.firstServeIn + rec.p2.secondServePoints;
  rec.p1.firstServePct = p1TotalFirstAttempts > 0 ? rec.p1.firstServeIn / p1TotalFirstAttempts * 100 : 0;
  rec.p2.firstServePct = p2TotalFirstAttempts > 0 ? rec.p2.firstServeIn / p2TotalFirstAttempts * 100 : 0;
  rec.p1.firstServePoints = rec.p1.firstServeIn;
  rec.p2.firstServePoints = rec.p2.firstServeIn;

  // Apply reconstruction:
  // For absent-stats matches — use reconstruction for everything
  // For normal matches — only fill in shot breakdown if missing from stats
  if (statsCompletelyAbsent) {
    Object.assign(p1Stats, rec.p1);
    Object.assign(p2Stats, rec.p2);
  } else {
    const statsHasShotData = (p1Stats.fhWinner ?? 0) + (p1Stats.fhError ?? 0) +
      (p1Stats.bhWinner ?? 0) + (p1Stats.bhError ?? 0) > 0;
    if (!statsHasShotData) {
      const shotOnlyFields = ['fhWinner','fhError','bhWinner','bhError',
        'fhSliceWinner','fhSliceError','fhVolleyWinner','fhVolleyError',
        'fhReturnWinner','fhReturnError','fhIOWinner','fhIOError',
        'overheadWinner','overheadError','approachWinner','approachError',
        'bhSliceWinner','bhSliceError','bhVolleyWinner','bhVolleyError',
        'bhReturnWinner','bhReturnError','winners','unforcedErrors','forcedErrors'];
      for (const f of shotOnlyFields) {
        p1Stats[f] = rec.p1[f];
        p2Stats[f] = rec.p2[f];
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────



  // Derived calculations
  const wueRatio = p1Stats.unforcedErrors > 0
    ? +((p1Stats.winners ?? 0) / p1Stats.unforcedErrors).toFixed(2)
    : null;
  const firstServePointsWonPct = p1Stats.firstServePoints > 0
    ? +((p1Stats.firstServePointsWon ?? 0) / p1Stats.firstServePoints * 100).toFixed(1)
    : null;
  const secondServePointsWonPct = p1Stats.secondServePoints > 0
    ? +((p1Stats.secondServePointsWon ?? 0) / p1Stats.secondServePoints * 100).toFixed(1)
    : null;

  // Rally length distribution
  // whoWonPoint in matchLog is a string "1" or "2" — must use loose equality
  const buckets = {
    "0-4": { total: 0, won: 0 },
    "5-8": { total: 0, won: 0 },
    "9+":  { total: 0, won: 0 },
  };
  for (const pt of points) {
    const rl = parseInt(pt.rallyLength, 10);
    if (isNaN(rl)) continue;
    // eslint-disable-next-line eqeqeq
    const valissaWon = pt.whoWonPoint == "1";
    const key = rl <= 4 ? "0-4" : rl <= 8 ? "5-8" : "9+";
    buckets[key].total++;
    if (valissaWon) buckets[key].won++;
  }
  const rallyDistribution = {};
  for (const [key, { total, won }] of Object.entries(buckets)) {
    rallyDistribution[key] = {
      total,
      valissaWins: won,
      valissaWinPct: total > 0 ? +(won / total * 100).toFixed(1) : null,
    };
  }

  // Set scores — read from stats when available, reconstruct from matchLog when absent
  let setScores;
  if (statsCompletelyAbsent) {
    const setMap = {};
    for (const pt of points) {
      const setNum = pt.setNumber;
      if (setNum == null) continue;
      if (!setMap[setNum]) setMap[setNum] = { p1: 0, p2: 0 };
      // eslint-disable-next-line eqeqeq
      if (pt.pOneSetScore != null) setMap[setNum].p1 = Math.max(setMap[setNum].p1, Number(pt.pOneSetScore));
      // eslint-disable-next-line eqeqeq
      if (pt.pTwoSetScore != null) setMap[setNum].p2 = Math.max(setMap[setNum].p2, Number(pt.pTwoSetScore));
    }
    const setNums = Object.keys(setMap).map(Number).sort((a, b) => a - b);
    setScores = {
      p1: setNums.map(n => setMap[n].p1),
      p2: setNums.map(n => setMap[n].p2),
    };
  } else {
    setScores = {
      p1: [p1Stats.setOneScore, p1Stats.setTwoScore].filter(s => s !== null),
      p2: [p2Stats.setOneScore, p2Stats.setTwoScore].filter(s => s !== null),
    };
  }

  return {
    matchId:        String(id),
    matchStartTime: matchStartTime ?? null,
    season:         season ?? null,
    whoWonMatch:    whoWonMatch ?? null,
    valissaName,
    opponentName,
    setScores,
    valissa:        p1Stats,
    opponent:       p2Stats,
    matchLog:       points,
    calculated: {
      wueRatio,
      firstServePointsWonPct,
      secondServePointsWonPct,
      rallyDistribution,
    },
  };
}
