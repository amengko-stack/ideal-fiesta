import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HomeScreen from "./HomeScreen.jsx";
import { toLocalDateStr } from "../lib/dates.js";
import { getWeekBounds } from "../lib/dates.js";

// ─── THE DEFAULT HOME SCREEN CARRIES NO WORKLOAD VERDICT ─────────────────────
// Home is the screen the family actually opens. It used to show the workload
// ratio in a tile whose number AND label were coloured by
// workloadTrendStatus(acwr).tone — red past 1.5, amber past 1.3, green in the
// middle — and the weekly-digest card repeated the same status underneath.
//
// A ratio has no validated meaning for one 12-year-old. Painting it red tells a
// parent their child is in danger; painting a quiet week green-then-grey
// invites reading rest as a deficiency. Both are gone: Home shows the
// comparison as a percentage against the recent average, in one colour.
//
// This is a static render, matching PlanScreen.test.jsx — what breaks in
// practice is the shape of the data, and a static render catches that without
// a DOM environment.

const { start } = getWeekBounds(0);
const dayInWeek = (n) => {
  const d = new Date(start);
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
};

const render = (props = {}) => renderToStaticMarkup(
  <HomeScreen
    weekLogs={[]}
    wellbeing={[]}
    xp={120}
    activeThisWeek={3}
    streak={4}
    onOpenCheckin={() => {}}
    earnedBadges={[]}
    onOpenBadge={() => {}}
    alerts={[]}
    onDismissAlert={() => {}}
    injuries={[]}
    priorities={[]}
    digest={null}
    showParentNotes={false}
    onOpenPlan={() => {}}
    guardianAlert={null}
    onDismissGuardian={() => {}}
    {...props}
  />
);

// A busy week and a quiet one, both measured against the same four weeks, so
// the ratio moves right across the retired band set.
const session = (dayOffset, rpe, duration) => ({
  id: `s${dayOffset}-${rpe}`, type: "tennis", date: dayInWeek(dayOffset), time: "16:00", rpe, duration,
});
const BUSY_WEEK = [session(0, 8, 120), session(1, 8, 120), session(2, 7, 90), session(3, 8, 120)];
const QUIET_WEEK = [session(0, 3, 30)];

const RETIRED_LABELS = ["In line with recent", "Above recent", "Below recent", "Well above recent", "No data"];

describe("HomeScreen — the workload ratio has no status", () => {
  it("renders at all, on an empty week", () => {
    const html = render();
    expect(html).toContain("load / wk");
    expect(html).toContain("days active");
  });

  it("shows the comparison as a percentage against the recent average", () => {
    const html = render({ weekLogs: BUSY_WEEK });
    expect(html).toContain("vs recent avg");
    expect(html).toMatch(/[+-]?\d+%|—/);
  });

  it("shows no retired status label, on any week", () => {
    for (const weekLogs of [BUSY_WEEK, QUIET_WEEK, []]) {
      const html = render({ weekLogs });
      for (const label of RETIRED_LABELS) {
        expect(html, `"${label}" is a retired status label`).not.toContain(`>${label}<`);
      }
    }
  });

  it("emits no medicalised workload language, on any week", () => {
    for (const weekLogs of [BUSY_WEEK, QUIET_WEEK, []]) {
      const html = render({ weekLogs });
      expect(html).not.toMatch(/optimal|underload|danger|caution|push more|ease up|injury risk|safe zone|train more/i);
    }
  });

  it("paints the load tiles the same colour whatever the ratio", () => {
    // The tile row: three cards, of which the middle one carried the ratio and
    // took its colour from the tone. A busy week and a quiet week must produce
    // the same palette here.
    const tilesOf = (weekLogs) => {
      const html = render({ weekLogs });
      const row = html.slice(html.indexOf("load / wk") - 600, html.indexOf("days active") + 40);
      return [...row.matchAll(/color:(#[0-9a-f]{3,6})/gi)].map(m => m[1].toLowerCase());
    };
    expect(tilesOf(QUIET_WEEK)).toEqual(tilesOf(BUSY_WEEK));
    expect(tilesOf([])).toEqual(tilesOf(BUSY_WEEK));
  });
});

describe("HomeScreen — the weekly digest card", () => {
  const digest = (load) => ({
    weekKey: toLocalDateStr(new Date(start)),
    weekStart: dayInWeek(0),
    weekEnd: dayInWeek(6),
    load,
    wellbeing: { checkinCount: 4 },
    matches: [],
    plan: { sessionCount: 2 },
    parentNote: "",
    athleteNote: "",
    priorities: { escalatedThisRun: [] },
  });

  it("shows the recent weekly average beside the week's load, not a graded ratio", () => {
    const html = render({
      digest: digest({ thisWeekSRPE: 2140, fourWeekAvg: 1830, acwr: 1.17, trendLabel: "In line with recent average", sessionCount: 4 }),
    });
    expect(html).toContain("Weekly review");
    expect(html).toContain("recent wkly avg");
    expect(html).toMatch(/1[.,]830/);   // toLocaleString separator is locale-dependent
    expect(html).toContain("In line with recent average");
  });

  it("still reads a legacy digest that stored acwrStatus, and ignores its tone", () => {
    // Documents written before the cutover carry {label, tone}. The label is
    // neutral and still renders; the tone is never read.
    const html = render({
      digest: digest({ thisWeekSRPE: 2140, fourWeekAvg: 900, acwr: 2.4, acwrStatus: { label: "Well above recent", tone: "danger" }, sessionCount: 4 }),
    });
    expect(html).toContain("Well above recent");
    expect(html).not.toMatch(/optimal|underload|caution|push more|ease up|injury risk/i);
  });

  it("says nothing at all when a legacy digest has no trend to report", () => {
    const html = render({
      digest: digest({ thisWeekSRPE: 0, fourWeekAvg: 0, acwr: null, acwrStatus: { label: "No data", tone: "muted" }, sessionCount: 0 }),
    });
    expect(html).toContain("Weekly review");
    expect(html).not.toContain(">No data<");
  });
});
