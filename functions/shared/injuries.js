// ─── INJURY / NIGGLE TAXONOMY ────────────────────────────────────────────────
// Tennis-relevant body sites for a growing junior. Shared by InjurySheet and
// the classic app's injury log (if/when one exists).

export const BODY_AREAS = [
  "Shoulder", "Elbow", "Wrist", "Hand/Finger", "Lower back", "Hip/Groin",
  "Thigh", "Knee", "Shin", "Calf", "Ankle", "Foot/Heel", "Neck", "Other",
];

export const SIDES = ["Left", "Right", "Both", "N/A"];

// Written for a 12-year-old to self-report honestly.
export const SEVERITY_LABELS = {
  1: "Niggle — noticeable but trains fine",
  2: "Mild — a bit sore, doesn't change how I play",
  3: "Moderate — changes how I move or hit",
  4: "Severe — can barely train",
  5: "Can't train at all",
};

const isValidDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());

const msPerDay = 24 * 60 * 60 * 1000;

// Short human summary, e.g. "Left knee · niggle (2/5) · 6 days".
export function describeInjury(injury) {
  if (!injury) return "";
  const side = injury.side && injury.side !== "N/A" ? `${injury.side} ` : "";
  const area = injury.bodyArea || "Injury";
  const sev = injury.severity;
  const sevWord = sev === 1 ? "niggle" : sev >= 4 ? "severe" : sev === 3 ? "moderate" : "mild";
  const parts = [`${side}${area}`.trim()];
  if (sev != null) parts.push(`${sevWord} (${sev}/5)`);
  const dur = injuryDuration(injury);
  if (dur != null) parts.push(`${dur} day${dur === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

// Days from onset to resolvedDate (or to `today` while open). Null on missing/
// invalid onset rather than NaN.
export function injuryDuration(injury, today = new Date()) {
  if (!injury || !isValidDate(injury.onsetDate)) return null;
  const onset = new Date(`${injury.onsetDate}T00:00:00`);
  let end;
  if (injury.status === "resolved" && isValidDate(injury.resolvedDate)) {
    end = new Date(`${injury.resolvedDate}T00:00:00`);
  } else {
    const t = today instanceof Date ? today : new Date(today);
    end = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }
  const days = Math.round((end - onset) / msPerDay);
  return days >= 0 ? days : null;
}

// Open injuries, most severe first, then most recent onset.
export function openInjuries(list) {
  return (list || [])
    .filter(i => i && i.status === "open")
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0) || (b.onsetDate || "").localeCompare(a.onsetDate || ""));
}

// Resolved injuries, most recently resolved first.
export function resolvedInjuries(list) {
  return (list || [])
    .filter(i => i && i.status === "resolved")
    .sort((a, b) => (b.resolvedDate || "").localeCompare(a.resolvedDate || ""));
}

// The safety verdict training-load consumers need: null when nothing's open,
// else { tone, headline, guidance }.
// Severity alone decides the verdict, so this needs no clock — how long the
// injury has been open is reported separately by injuryDuration.
export function injuryLoadFlag(list) {
  const open = openInjuries(list);
  if (open.length === 0) return null;

  const areas = [...new Set(open.map(i => i.bodyArea).filter(Boolean))];
  const areaText = areas.join(", ") || "an area";
  const maxSeverity = Math.max(...open.map(i => i.severity ?? 0));

  if (maxSeverity >= 4) {
    return {
      tone: "danger",
      headline: `${areaText} — training must be cleared by a medical professional`,
      guidance: "Training must be medical-clearance-gated; today's session should be recovery/rehab only.",
    };
  }
  if (maxSeverity === 3) {
    return {
      tone: "warn",
      headline: `${areaText} — avoid loading this area`,
      guidance: "Avoid loading the affected area and drop overall volume until it settles.",
    };
  }
  return {
    tone: "info",
    headline: `${areaText} — keep an eye on it`,
    guidance: "Monitor the niggle and avoid movements that aggravate it.",
  };
}

// Body areas injured minCount+ times within the window, newest (most recent
// onset) first — a repeat niggle in the same site is the real signal.
export function recurringAreas(list, { withinDays = 180, minCount = 2 } = {}) {
  const cutoff = new Date(new Date() - withinDays * msPerDay);
  const recent = (list || []).filter(i => i && i.bodyArea && isValidDate(i.onsetDate) && new Date(`${i.onsetDate}T00:00:00`) >= cutoff);

  const byArea = {};
  for (const i of recent) {
    if (!byArea[i.bodyArea]) byArea[i.bodyArea] = [];
    byArea[i.bodyArea].push(i);
  }

  return Object.entries(byArea)
    .filter(([, injuries]) => injuries.length >= minCount)
    .map(([bodyArea, injuries]) => ({
      bodyArea,
      count: injuries.length,
      mostRecentOnset: injuries.map(i => i.onsetDate).sort().slice(-1)[0],
    }))
    .sort((a, b) => (b.mostRecentOnset || "").localeCompare(a.mostRecentOnset || ""));
}
