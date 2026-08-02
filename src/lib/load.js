import { toLocalDateStr, getWeekBounds } from "./dates.js";

// All session types count at full weight. (The former 0.6 discount for
// "other" was retired when cross-training became a primary activity.)
export function sessionSRPE(log) {
  const rpe      = log.rpe ?? (log.intensity ? log.intensity * 2 : 5);
  const duration = log.duration || 60;
  return rpe * duration;
}

// Shared acute:chronic load computation used by BOTH the dashboard and the AI
// context, so they always report the same numbers. Acute = this week; chronic =
// mean of the 4 most recent complete Mon–Sun weeks (this week + 3 prior).
export function computeLoad(logs) {
  const weekSRPEs = [0, 1, 2, 3].map(weeksAgo => {
    const { start, end } = getWeekBounds(weeksAgo);
    return (logs || [])
      .filter(l => l.date >= start && l.date < end)
      .reduce((sum, l) => sum + sessionSRPE(l), 0);
  });
  const thisWeekSRPE = weekSRPEs[0];
  const fourWeekAvg  = weekSRPEs.reduce((a, b) => a + b, 0) / 4;
  const acwr = fourWeekAvg > 0
    ? Math.round((thisWeekSRPE / fourWeekAvg) * 100) / 100
    : null;
  return { weekSRPEs, thisWeekSRPE, fourWeekAvg, acwr };
}

// Wellbeing is written as two docs per day (a morning doc carrying `sleep`, a
// night doc carrying `energy`/`notes`). Merge them per date so no field is lost;
// later-time non-null values win on conflict. Returns a { date → entry } map.
export function mergeWellbeingByDate(entries) {
  const byDate = {};
  const sorted = [...(entries || [])].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  for (const w of sorted) {
    const merged = { ...(byDate[w.date] || {}) };
    for (const [k, v] of Object.entries(w)) {
      if (v != null) merged[k] = v;
    }
    byDate[w.date] = merged;
  }
  return byDate;
}

export function calculateMetrics(logs, wellbeing) {
  const { weekSRPEs, thisWeekSRPE, fourWeekAvg, acwr } = computeLoad(logs);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = toLocalDateStr(sevenDaysAgo);

  const dailyEntries = Object.values(
    mergeWellbeingByDate((wellbeing || []).filter(w => w.date >= sevenDaysAgoStr))
  );

  const avg = field => {
    const vals = dailyEntries.filter(w => w[field] != null).map(w => w[field]);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
  };

  return {
    thisWeekSRPE:  Math.round(thisWeekSRPE),
    weekSRPEs:     weekSRPEs.map(Math.round),
    fourWeekAvg:   Math.round(fourWeekAvg),
    acwr,
    avgSleep:      avg("sleep"),
    avgMood:       avg("mood"),
    avgSoreness:   avg("soreness"),
    wellbeingDays: dailyEntries.length,
  };
}

export function getACWRContext(acwr, tournamentStatus, sessionTime) {
  const notes = [];
  if (tournamentStatus === "pre")       notes.push("Pre-tournament (next 7 days): reduce volume ~35%, familiar exercises only, no new movements");
  if (tournamentStatus === "week_of")   notes.push("Tournament THIS week: activation only, max 6 exercises, nothing causing soreness");
  if (tournamentStatus === "post_hard") notes.push("Post heavy tournament: reduce volume ~25%, prioritise mobility and recovery");
  if (tournamentStatus === "post_easy") notes.push("Post light tournament: normal plan, monitor energy");

  if (acwr === null) {
    notes.push("Not enough load history yet — use conservative volume, focus on movement quality");
  } else if (acwr > 1.5) {
    notes.push(`ACWR ${acwr} — DANGER ZONE: significantly reduce volume, recovery and mobility only`);
  } else if (acwr > 1.3) {
    notes.push(`ACWR ${acwr} — CAUTION: reduce sets by 1–2, avoid new high-intensity exercises`);
  } else if (acwr < 0.8) {
    notes.push(`ACWR ${acwr} — UNDERLOADED: athlete can handle more volume and harder progressions`);
  } else {
    notes.push(`ACWR ${acwr} — OPTIMAL (0.8–1.3): normal progression, standard volume`);
  }

  if (sessionTime) {
    const h = parseInt(sessionTime.split(":")[0]);
    if (h < 10) notes.push("Morning session: CNS not fully activated, add extra warmup time");
    if (h >= 19) notes.push("Evening session: avoid high-intensity plyometrics after 7pm");
  }
  return notes;
}

// Per-week load history, oldest → newest, for trend charts. Each entry carries
// that week's sRPE split by type and its ACWR (that week ÷ mean of that week +
// 3 prior — the same window semantics as computeLoad). Three extra weeks are
// computed before the visible window so the oldest visible week still has a
// full ACWR denominator.
export function computeLoadHistory(logs, weeks = 12) {
  const totalWeeks = weeks + 3;
  const buckets = [];
  for (let weeksAgo = totalWeeks - 1; weeksAgo >= 0; weeksAgo--) {
    const { start, end } = getWeekBounds(weeksAgo);
    const srpeByType = { tennis: 0, match: 0, strength: 0, cheer: 0, other: 0 };
    let totalSrpe = 0;
    for (const l of logs || []) {
      if (l.date >= start && l.date < end) {
        const srpe = sessionSRPE(l);
        const key = srpeByType[l.type] != null ? l.type : "other";
        srpeByType[key] += srpe;
        totalSrpe += srpe;
      }
    }
    buckets.push({ weekStart: start, srpeByType, totalSrpe });
  }
  return buckets.slice(3).map((b, i) => {
    const window = buckets.slice(i, i + 4); // 3 prior weeks + this one
    const avg = window.reduce((s, w) => s + w.totalSrpe, 0) / 4;
    const acwr = avg > 0 ? Math.round((b.totalSrpe / avg) * 100) / 100 : null;
    return { ...b, acwr };
  });
}

// Readiness (0–100) from today's check-in: mood weighted 60%, inverse soreness 40%.
export function readinessScore(mood, soreness) {
  if (mood == null || soreness == null) return null;
  const raw = (mood / 5) * 60 + ((5 - soreness) / 5) * 40;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

// Human load-level label from ACWR. Shared by matchAnalysis.js and
// seasonReport.js so the two prompts can never drift on thresholds.
export function loadLevelFromAcwr(acwr) {
  if (acwr == null) return "Unknown";
  if (acwr < 0.8)  return "Low";
  if (acwr <= 1.3) return "Optimal";
  if (acwr <= 1.5) return "High";
  return "Very High";
}

// UI status for an ACWR value (thresholds match getACWRContext guidance).
export function acwrStatus(acwr) {
  if (acwr == null) return { label: "No data", tone: "muted" };
  if (acwr > 1.5)  return { label: "Ease up", tone: "danger" };
  if (acwr > 1.3)  return { label: "Careful", tone: "warn" };
  if (acwr < 0.8)  return { label: "Push more", tone: "limeDim" };
  return { label: "Balanced", tone: "success" };
}
