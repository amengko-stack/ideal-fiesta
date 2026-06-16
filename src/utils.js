export function getWeekBounds(weeksAgo) {
  const now = new Date();
  const day = now.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setDate(now.getDate() - daysToMonday - weeksAgo * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return {
    start: start.toISOString().split("T")[0],
    end:   end.toISOString().split("T")[0],
  };
}

export function sessionSRPE(log) {
  const rpe        = log.rpe ?? (log.intensity ? log.intensity * 2 : 5);
  const duration   = log.duration || 60;
  const multiplier = log.type === "other" ? 0.6 : 1.0;
  return rpe * duration * multiplier;
}

export function calculateMetrics(logs, wellbeing) {
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

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const byDate = {};
  (wellbeing || [])
    .filter(w => w.date >= sevenDaysAgoStr)
    .forEach(w => {
      if (!byDate[w.date] || (w.time || "") > (byDate[w.date].time || ""))
        byDate[w.date] = w;
    });
  const dailyEntries = Object.values(byDate);

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

export function parsePlistNode(node) {
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
    throw new Error("xml-parse-error");
  }

  const plist = xmlDoc.querySelector("plist");
  if (!plist) {
    throw new Error("no-plist-element");
  }

  const root = [...plist.childNodes].find(n => n.nodeType === 1);
  if (!root) {
    throw new Error("empty-plist");
  }

  return parsePlistNode(root);
}
