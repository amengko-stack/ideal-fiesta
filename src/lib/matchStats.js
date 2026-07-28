// ─── MATCH STATS ──────────────────────────────────────────────────────────────
// Computes the full head-to-head stat picture from a point log — the same
// screens MatchTrack shows (Match Stats / Shot Stats). Verified against a real
// .matchtrack export: every value reproduces from the log alone, which is why
// MatchTrack's own stored stat blocks can be empty. One calculator therefore
// serves both a live match (state.log) and a saved doc (match.matchLog), whose
// point shapes are identical.
//
// Deliberately independent of plist.js's aggregate STAT_FIELDS: those merge
// forced+unforced errors and fold shot variants onto the base wing, which the
// Shot Stats screen needs to keep apart.

const SVC_WINNER_SHOTS = new Set(["svcW", "svcW-t", "svcW-w"]);

// Display grouping for the Shot Stats screen, in MatchTrack's order. Approach,
// drop shot, overhead and lob combine both wings; everything else stays split.
export const SHOT_GROUPS = [
  { key: "fh",       label: "Forehand",              codes: ["fh"] },
  { key: "fhS",      label: "Forehand Slice",        codes: ["fhS"] },
  { key: "fhV",      label: "Forehand Volley",       codes: ["fhV"] },
  { key: "fhR",      label: "Forehand Return",       codes: ["fhR"] },
  { key: "fhPS",     label: "Forehand Passing Shot", codes: ["fhPS"] },
  { key: "fhIO",     label: "Inside-Out",            codes: ["fhIO"] },
  { key: "bh",       label: "Backhand",              codes: ["bh"] },
  { key: "bhS",      label: "Backhand Slice",        codes: ["bhS"] },
  { key: "bhV",      label: "Backhand Volley",       codes: ["bhV"] },
  { key: "bhR",      label: "Backhand Return",       codes: ["bhR"] },
  { key: "bhPS",     label: "Backhand Passing Shot", codes: ["bhPS"] },
  { key: "approach", label: "Approach",              codes: ["fhA", "bhA"] },
  { key: "dropShot", label: "Drop Shot",             codes: ["fhDS", "bhDS"] },
  { key: "overhead", label: "Overhead",              codes: ["fhOH", "bhOH"] },
  { key: "lob",      label: "Lob",                   codes: ["fhLOB", "bhLOB"] },
];

const emptyPlayer = () => ({
  firstIn: 0, firstWon: 0, secondPts: 0, secondWon: 0,
  aces: 0, doubleFaults: 0, serviceWinners: 0,
  firstReturnPts: 0, firstReturnWon: 0, secondReturnPts: 0, secondReturnWon: 0,
  bpFaced: 0, bpSaved: 0, bpChances: 0, bpConverted: 0,
  totalWon: 0, touches: { "0-4": 0, "5-8": 0, "9+": 0 },
  winners: 0, unforcedErrors: 0, forcedErrors: 0,
  byShot: { winners: {}, forced: {}, unforced: {} },
});

const bump = (obj, code) => { if (code) obj[code] = (obj[code] || 0) + 1; };
const pct = (n, d) => (d > 0 ? +((n / d) * 100).toFixed(1) : null);

// log: array of MatchTrack-shaped points. Returns { p1, p2, totalPoints }.
// Live logs mark aces via the engine's `outcome` field; imported MatchTrack
// logs don't distinguish them from service winners, so a saved match can pass
// its stored counts as `{ aces: { p1, p2 } }`.
export function computeMatchStats(log, { aces } = {}) {
  const stats = { p1: emptyPlayer(), p2: emptyPlayer() };
  const points = Array.isArray(log) ? log : [];

  for (const pt of points) {
    const server = Number(pt.whoServed);
    const winner = Number(pt.whoWonPoint);
    if (winner !== 1 && winner !== 2) continue;

    const won = winner === 1 ? stats.p1 : stats.p2;
    won.totalWon += 1;

    // Rally buckets count the point for whoever WON it (MatchTrack's "Touches").
    const rl = Number(pt.rallyLength);
    if (Number.isFinite(rl)) {
      won.touches[rl <= 4 ? "0-4" : rl <= 8 ? "5-8" : "9+"] += 1;
    }

    const type = pt.pointWonType ?? null;
    const shot = pt.pointShotType ?? null;

    // Winners / errors are attributed to whoever hit the shot.
    const hit = Number(pt.whoHitShot);
    const hitter = hit === 1 ? stats.p1 : hit === 2 ? stats.p2 : null;
    if (hitter) {
      if (type === "w" && !SVC_WINNER_SHOTS.has(shot)) {
        hitter.winners += 1;
        bump(hitter.byShot.winners, shot);
      } else if (type === "fE") {
        hitter.forcedErrors += 1;
        bump(hitter.byShot.forced, shot);
      } else if (type === "ufE") {
        hitter.unforcedErrors += 1;
        bump(hitter.byShot.unforced, shot);
      }
    }

    if (server !== 1 && server !== 2) continue;
    const sv = server === 1 ? stats.p1 : stats.p2;
    const rt = server === 1 ? stats.p2 : stats.p1;
    const serverWon = winner === server;

    // Service winners are counted apart from rally winners (MatchTrack splits
    // "Winners" and "Service Winners", summing them as "Total Winners").
    if (type === "svcW" || SVC_WINNER_SHOTS.has(shot)) sv.serviceWinners += 1;
    if (pt.outcome === "ace") sv.aces += 1;

    const serveType = Number(pt.serveType);
    if (serveType === 1) {
      sv.firstIn += 1;
      if (serverWon) sv.firstWon += 1;
      rt.firstReturnPts += 1;
      if (!serverWon) rt.firstReturnWon += 1;
    } else if (serveType === 2) {
      sv.secondPts += 1;
      if (type === "df") sv.doubleFaults += 1;
      else if (serverWon) sv.secondWon += 1;
      // Return points count every second serve faced — a double fault is a
      // return point won (verified against MatchTrack's own totals).
      rt.secondReturnPts += 1;
      if (!serverWon) rt.secondReturnWon += 1;
    }

    // Break points: imported MatchTrack logs carry explicit saved/won flags
    // (its `breakPoint` field is unreliable); our live engine stamps
    // `breakPoint` and the outcome follows from who won the point.
    if (pt.breakPointSaved != null || pt.breakPointWon != null) {
      if (Number(pt.breakPointSaved) === 1) sv.bpSaved += 1;
      if (Number(pt.breakPointWon) === 1) rt.bpConverted += 1;
    } else if (Number(pt.breakPoint) === 1) {
      if (serverWon) sv.bpSaved += 1;
      else rt.bpConverted += 1;
    }
  }

  if (aces) {
    if (aces.p1 != null) stats.p1.aces = aces.p1;
    if (aces.p2 != null) stats.p2.aces = aces.p2;
  }

  // Every break point faced is either saved or converted, so the totals follow
  // from the two counters — true for both log conventions above.
  stats.p1.bpFaced = stats.p1.bpSaved + stats.p2.bpConverted;
  stats.p2.bpFaced = stats.p2.bpSaved + stats.p1.bpConverted;
  stats.p1.bpChances = stats.p1.bpConverted + stats.p2.bpSaved;
  stats.p2.bpChances = stats.p2.bpConverted + stats.p1.bpSaved;

  const totalPoints = stats.p1.totalWon + stats.p2.totalWon;
  for (const p of [stats.p1, stats.p2]) {
    p.firstAttempts = p.firstIn + p.secondPts;
    p.firstServePct = pct(p.firstIn, p.firstAttempts);
    // 2nd Serve % is second serves *made*, i.e. excluding double faults.
    p.secondServePct = pct(p.secondPts - p.doubleFaults, p.secondPts);
    p.totalWinners = p.winners + p.serviceWinners;
    p.pointsWonPct = pct(p.totalWon, totalPoints);
  }
  return { ...stats, totalPoints, hasLog: points.length > 0 };
}

// Rows for the Match Stats table, in MatchTrack's order. `kind` drives display:
//   pct    → "60.8%"        value: number|null
//   count  → "6"            value: number
//   frac   → "15/31 (48.4%)" value: { n, d }
export const MATCH_STAT_ROWS = [
  { label: "1st Serve %",           kind: "pct",   get: p => p.firstServePct },
  { label: "2nd Serve %",           kind: "pct",   get: p => p.secondServePct },
  { label: "Aces",                  kind: "count", get: p => p.aces },
  { label: "Double Faults",         kind: "count", get: p => p.doubleFaults },
  { label: "Winners",               kind: "count", get: p => p.winners },
  { label: "Service Winners",       kind: "count", get: p => p.serviceWinners },
  { label: "Total Winners",         kind: "count", get: p => p.totalWinners },
  { label: "Unforced Errors",       kind: "count", get: p => p.unforcedErrors },
  { label: "Forced Errors",         kind: "count", get: p => p.forcedErrors },
  { label: "1st Serve Points Won",  kind: "frac",  get: p => ({ n: p.firstWon, d: p.firstIn }) },
  { label: "2nd Serve Points Won",  kind: "frac",  get: p => ({ n: p.secondWon, d: p.secondPts }) },
  { label: "Break Points Saved",    kind: "frac",  get: p => ({ n: p.bpSaved, d: p.bpFaced }) },
  { label: "1st Return Points Won", kind: "frac",  get: p => ({ n: p.firstReturnWon, d: p.firstReturnPts }) },
  { label: "2nd Return Points Won", kind: "frac",  get: p => ({ n: p.secondReturnWon, d: p.secondReturnPts }) },
  { label: "Break Points Won",      kind: "frac",  get: p => ({ n: p.bpConverted, d: p.bpChances }) },
  { label: "Total Points Won",      kind: "count", get: p => p.totalWon },
  { label: "% of Points Won",       kind: "pct",   get: p => p.pointsWonPct },
  { label: "0-4 Touches",           kind: "count", get: p => p.touches["0-4"] },
  { label: "5-8 Touches",           kind: "count", get: p => p.touches["5-8"] },
  { label: "9+ Touches",            kind: "count", get: p => p.touches["9+"] },
];

export function formatStat(kind, value) {
  if (kind === "pct") return value == null ? "—" : `${value.toFixed(1)}%`;
  if (kind === "frac") {
    if (!value || !value.d) return "0/0";
    return `${value.n}/${value.d} (${((value.n / value.d) * 100).toFixed(1)}%)`;
  }
  return String(value ?? 0);
}

// Sums a shot group for one player and outcome ("winners"|"forced"|"unforced").
export const shotGroupTotal = (player, group, outcome) =>
  group.codes.reduce((sum, code) => sum + (player.byShot[outcome][code] || 0), 0);

// Degraded fallback for legacy imports that carry stored stats but no point log
// (Shot Stats, Touches and the Match Log are hidden by the caller in that case).
export function statsFromAggregates(match) {
  const build = (s = {}) => {
    const p = emptyPlayer();
    p.firstIn = s.firstServePoints ?? 0;
    p.firstWon = s.firstServePointsWon ?? 0;
    p.secondPts = s.secondServePoints ?? 0;
    p.secondWon = s.secondServePointsWon ?? 0;
    p.aces = s.aces ?? 0;
    p.doubleFaults = s.doubleFaults ?? 0;
    p.serviceWinners = s.serviceWinners ?? 0;
    p.firstReturnPts = s.firstReturnPoints ?? 0;
    p.firstReturnWon = s.firstReturnPointsWon ?? 0;
    p.secondReturnPts = s.secondReturnPoints ?? 0;
    p.secondReturnWon = s.secondReturnPointsWon ?? 0;
    p.bpFaced = s.breakPointsFaced ?? 0;
    p.bpSaved = s.breakPointsSaved ?? 0;
    p.bpChances = s.breakPoints ?? 0;
    p.bpConverted = s.breakPointsWon ?? 0;
    p.winners = s.winners ?? 0;
    p.unforcedErrors = s.unforcedErrors ?? 0;
    p.forcedErrors = s.forcedErrors ?? 0;
    p.firstAttempts = p.firstIn + p.secondPts;
    p.firstServePct = s.firstServePct != null ? Number(s.firstServePct) : pct(p.firstIn, p.firstAttempts);
    p.secondServePct = pct(p.secondPts - p.doubleFaults, p.secondPts);
    p.totalWinners = p.winners + p.serviceWinners;
    return p;
  };
  const p1 = build(match?.valissa);
  const p2 = build(match?.opponent);
  // No per-point record, so total points can't be derived — leave them null.
  p1.totalWon = null; p2.totalWon = null;
  p1.pointsWonPct = null; p2.pointsWonPct = null;
  return { p1, p2, totalPoints: null, hasLog: false };
}
