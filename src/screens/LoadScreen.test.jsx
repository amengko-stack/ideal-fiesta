import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LoadScreen from "./LoadScreen.jsx";
import { getWeekBounds, toLocalDateStr } from "../lib/dates.js";

// Static render guard for the Load screen. The thing worth protecting here is
// the language: the acute:chronic ratio is a descriptive trend, so the screen
// must never tell the family a week is a danger zone, nor tell a quiet week to
// train more.

const monday = getWeekBounds(0).start;
const dayInWeek = (offset) => {
  const d = new Date(`${monday}T00:00:00`);
  d.setDate(d.getDate() + offset);
  // toLocalDateStr, not toISOString: the Date above is LOCAL midnight, so in
  // any UTC+ zone toISOString rolls back a day and Monday's logs fall outside
  // the week getWeekBounds() just returned.
  return toLocalDateStr(d);
};

const render = (weekLogs) => renderToStaticMarkup(<LoadScreen weekLogs={weekLogs} />);

const BUSY_WEEK = [
  { type: "tennis",   rpe: 7, duration: 120, date: dayInWeek(0), time: "16:00" },
  { type: "tennis",   rpe: 7, duration: 120, date: dayInWeek(1), time: "16:00" },
  { type: "tennis",   rpe: 6, duration: 120, date: dayInWeek(2), time: "16:00" },
  { type: "strength", rpe: 6, duration: 55,  date: dayInWeek(0), time: "07:00" },
  { type: "other",    rpe: 4, duration: 40,  date: dayInWeek(3), time: "07:00", sportName: "Swimming" },
  { type: "match",    rpe: 8, duration: 75,  date: dayInWeek(5), time: "09:00", result: "W" },
];

describe("LoadScreen — category breakdown", () => {
  const html = render(BUSY_WEEK);

  it("splits the week by training category, not just one sRPE number", () => {
    expect(html).toContain("This week&#x27;s training");
    expect(html).toContain("Tennis training");
    expect(html).toContain("Matches");
    expect(html).toContain("Strength (S&amp;C)");
    expect(html).toContain("Swim / cross-training");
    expect(html).toContain("360 min"); // tennis
    expect(html).toContain("75 min");  // matches
    expect(html).toContain("55 min");  // strength
    expect(html).toContain("40 min");  // cross-training
  });

  it("reports total organised minutes, complete rest days and sRPE", () => {
    expect(html).toContain("total organised min");
    expect(html).toContain("complete rest days");
    expect(html).toContain("sRPE");
    expect(html).toContain("530"); // total organised minutes
  });

  it("shows target vs actual as a target", () => {
    expect(html).toContain("Target vs actual");
    expect(html).toContain("A target, not a ceiling");
    expect(html).toContain("target 11.5–12.5 h");
    expect(html).toContain("target ≥ 1");
  });

  it("reports the rolling 7-day figure against the recent baseline", () => {
    expect(html).toContain("Last 7 days");
    expect(html).toContain("recent weekly average");
  });
});

describe("LoadScreen — neutral workload language", () => {
  it("never labels a week as a danger zone or tells a quiet week to train more", () => {
    for (const logs of [BUSY_WEEK, [], [{ type: "tennis", rpe: 3, duration: 30, date: dayInWeek(0), time: "16:00" }]]) {
      const html = render(logs);
      expect(html).not.toMatch(/danger/i);
      expect(html).not.toMatch(/Ease up/);
      expect(html).not.toMatch(/Push more/);
      expect(html).not.toMatch(/Underloaded/i);
      expect(html).not.toMatch(/you can handle a bit more/i);
      expect(html).not.toMatch(/take it easy today/i);
      // No medicalised claim anywhere on the screen, from any signal — the
      // monotony note used to say same-load days "raise injury risk".
      expect(html).not.toMatch(/injury risk/i);
      expect(html).not.toMatch(/raises? .*risk/i);
    }
  });

  it("shows the comparison as two totals and the difference between them", () => {
    const html = render(BUSY_WEEK);
    // The brief's preferred presentation: this week, the recent average, and
    // the percentage between them — all three printed, none of them graded.
    expect(html).toMatch(/Last 7 days \d+ sRPE/);
    expect(html).toMatch(/recent weekly average \d+ sRPE/);
    expect(html).toMatch(/[+-]\d+%/);
    expect(html).toContain("vs recent average");
    expect(html).toContain("12-week workload trend");
    expect(html).toContain("nothing here marks a week good, bad or risky");
  });

  it("gives the ratio no status chip, at any ratio", () => {
    // The hero used to carry a pill whose background and text colour came from
    // workloadTrendStatus(acwr).tone — red above 1.5, amber above 1.3, green in
    // the middle — with the tone's label inside it. BUSY_WEEK sits far above
    // the old danger line and QUIET_WEEK far below; neither may produce one.
    const QUIET_WEEK = [{ type: "tennis", rpe: 2, duration: 20, date: dayInWeek(0), time: "16:00" }];
    for (const logs of [BUSY_WEEK, QUIET_WEEK, []]) {
      const html = render(logs);
      for (const label of ["In line with recent", "Above recent", "Below recent", "Well above recent"]) {
        expect(html, `${label} is a retired status label`).not.toContain(`>${label}<`);
      }
    }
  });

  it("renders with no logs at all, and says so without a status", () => {
    const html = render([]);
    expect(html).toContain("Log a few sessions to see your load picture.");
    expect(html).not.toContain("No data");   // that was the muted-tone status label
    expect(html).toMatch(/vs recent average/);
  });
});

// ─── LEGACY CROSS-TRAINING COMPATIBILITY ─────────────────────────────────────
// Cheerleading is no longer part of the week, but logs written while it was
// are real training that really happened. They must keep rendering and keep
// counting — without the screen implying cheer is a current secondary sport.
describe("LoadScreen — legacy cheer logs", () => {
  const LEGACY_WEEK = [
    ...BUSY_WEEK,
    { type: "cheer", rpe: 6, duration: 90, date: dayInWeek(4), time: "17:00" },
  ];

  it("still counts an old cheer log towards the week's load", () => {
    const withLegacy = render(LEGACY_WEEK);
    const without = render(BUSY_WEEK);
    // 6 × 90 = 540 sRPE that must not be silently dropped.
    expect(withLegacy).not.toBe(without);
    expect(withLegacy).toContain("540");
  });

  it("rolls it up as cross-training minutes rather than losing it", () => {
    const html = render(LEGACY_WEEK);
    expect(html).toContain("Swim / cross-training");
  });

  it("never presents cheer as a current activity", () => {
    const html = render(LEGACY_WEEK);
    expect(html).not.toMatch(/Cheer/);
    expect(html).not.toMatch(/cheerlead/i);
    expect(html).toContain("Cross-training");
  });
});
