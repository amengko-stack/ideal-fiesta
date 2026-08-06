// ─── ATHLETE IDENTITY ────────────────────────────────────────────────────────
// Single source of truth for who the athlete is: age, competition division, and
// whether she is playing up. Every AI prompt renders its athlete header from
// here so age can never again be hardcoded into a prompt and go stale on a
// birthday (it previously appeared as a literal "12" in nine places).
//
// Pure module — no Firestore, no React. Safe to unit test in the default node
// environment the rest of src/lib/*.test.js runs in.

// Junior divisions, ordered youngest first. `cutoff` is the oldest age that can
// appear in the draw. Conventions differ between federations on whether "U14"
// means "under 14" or "14 and under"; we take the inclusive reading so the
// derived "up to N years older" figure is an upper bound and never understates
// the physical gap she is facing.
export const AGE_CATEGORIES = [
  { id: "U10",  label: "Under-10", cutoff: 10 },
  { id: "U12",  label: "Under-12", cutoff: 12 },
  { id: "U14",  label: "Under-14", cutoff: 14 },
  { id: "U16",  label: "Under-16", cutoff: 16 },
  { id: "U18",  label: "Under-18", cutoff: 18 },
  { id: "Open", label: "Open",     cutoff: null },
];

export const DEFAULT_CATEGORY = "U12";

const byId = id => AGE_CATEGORIES.find(c => c.id === id) || null;

export function categoryLabel(id) {
  return byId(id)?.label ?? id ?? "—";
}

export function categoryCutoff(id) {
  const c = byId(id);
  return c ? c.cutoff : null;
}

// Birthday-correct whole years. The three previous call sites all used
// `(now - dob) / (365.25 * msPerDay)`, which drifts by a day around leap years
// and can report the wrong age on the birthday itself.
export function computeAge(dob, now = new Date()) {
  if (!dob) return null;
  // Parse date-only strings as local midnight; `new Date("2013-05-04")` is UTC
  // and reads as the previous day in negative-offset timezones.
  const d = dob instanceof Date
    ? dob
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(dob)) ? `${dob}T00:00:00` : String(dob));
  if (Number.isNaN(d.getTime())) return null;

  let age = now.getFullYear() - d.getFullYear();
  const monthDelta = now.getMonth() - d.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < d.getDate())) age -= 1;
  return age < 0 ? null : age;
}

// The division the athlete would play in on age alone — the smallest bracket
// that still admits her. Used as the default before a parent sets one, so we
// never silently assume she is playing up.
export function chronologicalCategory(age) {
  if (age == null) return null;
  const fit = AGE_CATEGORIES.find(c => c.cutoff != null && age <= c.cutoff);
  return fit ? fit.id : "Open";
}

// How many years above her own bracket she is competing. 0 = at level.
// Age 12 in U14 → 2. Age 13 in U14 → 0 (U14 *is* her bracket by then), which is
// what makes the prompt text self-correct on her next birthday.
export function playingUpYears(age, categoryId) {
  const cutoff = categoryCutoff(categoryId);
  const own    = categoryCutoff(chronologicalCategory(age));
  if (age == null || cutoff == null || own == null) return 0;
  return Math.max(0, cutoff - own);
}

// Resolves a raw Firestore profile doc into everything the UI and the prompts
// need. `category` falls back to her chronological division, never to a guess.
export function resolveIdentity(profile, now = new Date()) {
  const name      = profile?.name?.trim() || "Valissa";
  const age       = computeAge(profile?.dob, now);
  const category  = profile?.competitionCategory || chronologicalCategory(age) || DEFAULT_CATEGORY;
  const cutoff    = categoryCutoff(category);
  const playingUp = playingUpYears(age, category);

  return {
    name,
    firstName:   name.split(" ")[0],
    dob:         profile?.dob || null,
    age,
    category,
    categoryLabel: categoryLabel(category),
    cutoff,
    playingUp,
    isPlayingUp: playingUp > 0,
    // Upper bound on the age gap to the oldest opponent in the draw.
    yearsOlderOpponents: age != null && cutoff != null ? Math.max(0, cutoff - age) : null,
  };
}

// One-line summary for compact UI chips: "Age 12 · Under-14 (playing up 2)".
export function identityChipText(profile, now = new Date()) {
  const id = resolveIdentity(profile, now);
  const parts = [];
  if (id.age != null) parts.push(`Age ${id.age}`);
  parts.push(id.categoryLabel);
  if (id.isPlayingUp) parts.push(`playing up ${id.playingUp}`);
  return parts.join(" · ");
}

// The canonical athlete header injected at the top of every AI prompt.
// When she is at level the playing-up guidance collapses away entirely, so this
// stays correct as she ages into U14 and later into U16.
export function identityBlock(profile, now = new Date()) {
  const id  = resolveIdentity(profile, now);
  const ageText = id.age != null ? `age ${id.age}` : "age unknown";
  const dobText = id.dob ? ` (DOB ${id.dob})` : "";

  const head = `ATHLETE: ${id.name} · female · ${ageText}${dobText}`;

  if (!id.isPlayingUp) {
    return [
      head,
      `COMPETITION DIVISION: ${id.categoryLabel} — she is competing in her own age division.`,
      `  • Opponents are broadly her own age and stage of physical development.`,
      `  • Judge results against her peers: here, losses are genuine development signals`,
      `    rather than an artefact of a physical mismatch.`,
    ].join("\n");
  }

  const gap = id.yearsOlderOpponents ?? id.playingUp;

  return [
    head,
    `COMPETITION DIVISION: ${id.categoryLabel} — she is PLAYING UP by ${id.playingUp} year${id.playingUp === 1 ? "" : "s"}.`,
    `  • Opponents may be up to ${gap} year${gap === 1 ? "" : "s"} older, taller, stronger and`,
    `    further through puberty than she is.`,
    `  • Interpret results in that light: a competitive loss to an older opponent is a`,
    `    development win, not a failure. Do NOT report an expected physical or power`,
    `    deficit as a technical fault.`,
    `  • Where she is out-hit rather than out-played, say so explicitly and keep the two`,
    `    separate — they lead to completely different training responses.`,
    `  • Tactical maturity, ball tolerance, court position and shot selection are the`,
    `    levers she can win with at this division now; raw power is not.`,
  ].join("\n");
}

// Shared system prompt for the post-session motivational shout-out. Previously
// duplicated verbatim in LogSheet.jsx and AVLogSession.jsx with the age baked in.
// `recent` lets the model actually honour "don't repeat yourself" — without it
// that instruction was unfollowable, since each call is stateless.
export function shoutoutSystemPrompt(profile, recent = [], now = new Date()) {
  const id = resolveIdentity(profile, now);
  const ageText = id.age != null ? `${id.age}-year-old` : "junior";
  const div = id.isPlayingUp
    ? ` She competes in ${id.categoryLabel}, playing up ${id.playingUp} year${id.playingUp === 1 ? "" : "s"} against older girls — acknowledge that grit when it fits.`
    : ` She competes in ${id.categoryLabel}.`;

  const avoid = recent.length
    ? `\n\nYou have recently sent these messages — do NOT reuse their phrasing, openings or imagery:\n${recent.slice(0, 5).map(m => `- "${m}"`).join("\n")}`
    : "";

  return `You are an encouraging sports coach writing a short motivational message to a ${ageText} female tennis athlete named ${id.name} who also cross-trains in other sports.${div} Keep it genuine, specific, and energetic — not generic. Write like a coach who actually watched her train, not a robot. Maximum 2 sentences.${avoid}`;
}
