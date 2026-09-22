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
    expect(html).toContain("recent 4-week weekly average");
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
    }
  });

  it("describes the trend and asks for a review instead of prescribing", () => {
    const html = render(BUSY_WEEK);
    expect(html).toMatch(/In line with recent|Above recent|Below recent|Well above recent|No data/);
    expect(html).toContain("12-week workload trend");
    expect(html).toContain("it is a trend line, not a risk score");
  });

  it("renders with no logs at all", () => {
    const html = render([]);
    expect(html).toContain("No data");
    expect(html).toContain("Log a few sessions to see your load picture.");
  });
});
