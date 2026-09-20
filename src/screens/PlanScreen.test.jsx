import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PlanScreen from "./PlanScreen.jsx";
import { buildWeeklyFramework, buildWeeklyPlanDoc } from "../lib/weeklyPlanCore.js";

// Render-level guard for the weekly Plan screen. It is deliberately a static
// render rather than a full interaction test: what keeps breaking in practice is
// a plan document shape the screen does not expect (a pre-v2 plan, a tournament
// week with one session, a plan with no metrics), and a static render catches
// every one of those without a DOM environment.

const render = (props) => renderToStaticMarkup(
  <PlanScreen
    tournaments={[]}
    loading={false}
    error={null}
    onGenerate={() => {}}
    onToggleExercise={() => {}}
    onFinishSession={() => {}}
    onRegenerate={() => {}}
    {...props}
  />
);

const weeklyPlan = (over = {}) => buildWeeklyPlanDoc({
  weekKey: "2026-03-16",
  framework: buildWeeklyFramework({ blockWeek: 3, blockNumber: 1 }),
  generatedAt: "2026-03-15T09:00:00.000Z",
  growthContext: { velocityCmYr: 9, intervalDays: 183, growthWatch: true, sufficientInterval: true },
  metrics: { thisWeekSRPE: 1215, acwr: 1.1 },
  coachNote: "Steady week.",
  athleteNote: "Great work on the landings!",
  rationales: { briefing: "A steady week of building." },
  ...over,
});

describe("PlanScreen — empty state", () => {
  it("invites the family to build the week, not a Sunday session", () => {
    const html = render({ plan: null });
    expect(html).toContain("Let&#x27;s build this week&#x27;s S&amp;C plan");
    expect(html).toContain("Generate this week&#x27;s S&amp;C plan");
    expect(html).not.toContain("Sunday&#x27;s plan");
    expect(html).not.toContain("SUNDAY SESSION");
  });

  it("shows the failure reason on the card rather than losing it to a toast", () => {
    const html = render({ plan: null, error: "The AI service timed out." });
    expect(html).toContain("COULDN&#x27;T BUILD THE PLAN");
    expect(html).toContain("The AI service timed out.");
  });
});

describe("PlanScreen — weekly view", () => {
  const html = render({ plan: weeklyPlan() });

  it("renders the week rather than one session", () => {
    expect(html).toContain("WEEKLY S&amp;C PLAN");
    expect(html).toContain("Block 1 · week 3 of 8");
    expect(html).not.toContain("SUNDAY SESSION");
  });

  it("shows Session A on Monday and Session B on Thursday with their titles", () => {
    expect(html).toContain("Session A");
    expect(html).toContain("Monday");
    expect(html).toContain("Strength Foundation + Acceleration + Landing");
    expect(html).toContain("Session B");
    expect(html).toContain("Thursday");
    expect(html).toContain("Single-Leg Strength + Deceleration/COD + Rotational Power");
  });

  it("gives each session its own finish-and-log action once something is ticked", () => {
    const plan = weeklyPlan();
    const withProgress = {
      ...plan,
      sessions: plan.sessions.map(s => ({ ...s, doneMap: { [s.exercises[0].id]: true } })),
    };
    const markup = render({ plan: withProgress });
    expect(markup).toContain("Finish &amp; log Session A");
    expect(markup).toContain("Finish &amp; log Session B");
  });

  it("marks only the logged session as logged", () => {
    const plan = weeklyPlan();
    const aLogged = {
      ...plan,
      sessions: plan.sessions.map(s => (s.id === "A" ? { ...s, sessionLogged: true } : s)),
    };
    const markup = render({ plan: aLogged });
    expect(markup.match(/✓ logged/g)).toHaveLength(1);
  });

  it("shows Sunday as a recovery day", () => {
    expect(html).toContain("Sunday");
    expect(html).toContain("Recovery day");
    expect(html).toContain("Complete structured-training rest day");
  });

  it("surfaces the growth-watch banner when growth is rapid", () => {
    expect(html).toContain("Growth watch");
    expect(html).toContain("prioritise movement quality, recovery and gradual load progression");
    expect(html).toContain("9 cm/year");
  });

  it("never renders a PHV or puberty-stage claim", () => {
    expect(html).not.toMatch(/PHV/);
    expect(html).not.toMatch(/puberty/i);
  });

  it("describes workload without medicalised zone labels", () => {
    expect(html).toContain("In line with recent");
    expect(html).not.toMatch(/danger zone/i);
    expect(html).not.toMatch(/Ease up/);
    expect(html).not.toMatch(/Push more/);
  });
});

describe("PlanScreen — target vs actual", () => {
  it("shows the target as a target and suggests replacing court volume when over", () => {
    const html = render({
      plan: weeklyPlan({
        loadContext: {
          targetComparison: {
            tennis: { label: "Tennis (incl. matches)", targetLabel: "11.5–12.5 h", actual: 14.5, actualLabel: "14.5 h", status: "over" },
            strength: { label: "S&C sessions", targetLabel: "2", actual: 2, actualLabel: "2", status: "within" },
            crossTraining: { label: "Swim / cross-training", targetLabel: "30–45 min", actual: 40, actualLabel: "40 min", status: "within" },
            restDays: { label: "Complete rest days", targetLabel: "≥ 1", actual: 1, actualLabel: "1", status: "within" },
            tennisOverTargetMessage: "Current tennis volume is above the present developmental target; consider replacing court volume rather than adding S&C.",
          },
        },
      }),
    });
    expect(html).toContain("Target vs actual");
    expect(html).toContain("not a medical ceiling, and not a pass/fail line");
    expect(html).toContain("consider replacing court volume rather than adding S&amp;C");
    expect(html).not.toMatch(/failed|over-?training|too much/i);
  });
});

describe("PlanScreen — tournament week", () => {
  it("shows the one maintenance session and the second as recovery", () => {
    const html = render({
      plan: weeklyPlan({ framework: buildWeeklyFramework({ blockWeek: 3, tournamentMode: "week_of" }) }),
    });
    expect(html).toContain("Session A");
    expect(html).toContain("Session B");
    expect(html).toContain("recovery");
    expect(html).toContain("one shortened maintenance session");
  });
});

describe("PlanScreen — legacy plans still render", () => {
  const legacy = {
    plan: [
      { id: "goblet_squat", name: "Goblet Squat", sets: 3, reps: 10, note: "Heavier than last week" },
      { id: "plank", name: "Plank Hold", sets: 3, reps: 30 },
    ],
    doneMap: { goblet_squat: true },
    sessionLogged: false,
    sessionType: "reduced",
    sessionDuration: 45,
    briefing: "An older plan from before the weekly restructure.",
    metrics: { thisWeekSRPE: 900, acwr: 1.2 },
    generatedAt: "2026-02-01T09:00:00.000Z",
  };

  it("renders a pre-schema-v2 plan without crashing", () => {
    const html = render({ plan: legacy });
    expect(html).toContain("Goblet Squat");
    expect(html).toContain("Plank Hold");
    expect(html).toContain("An older plan from before the weekly restructure.");
    expect(html).toContain("Recovery day");
  });

  it("renders a plan with no metrics, no growth context and no sessions", () => {
    expect(() => render({ plan: { plan: [], generatedAt: "2026-02-01T09:00:00.000Z" } })).not.toThrow();
    expect(() => render({ plan: {} })).not.toThrow();
  });
});
