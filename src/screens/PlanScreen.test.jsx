import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import PlanScreen from "./PlanScreen.jsx";
import { buildWeeklyFramework, buildWeeklyPlanDoc, MOVEMENT_QUALITY, MOVEMENT_QUALITY_OPTIONS } from "../lib/weeklyPlanCore.js";

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
    expect(html).toContain("In line with recent average");
    expect(html).not.toMatch(/danger zone/i);
    expect(html).not.toMatch(/Ease up/);
    expect(html).not.toMatch(/Push more/);
  });

  it("gives the workload ratio no tone at any value", () => {
    // The tile used to take its number colour AND its label colour from
    // workloadTrendStatus(acwr).tone — red past 1.5, amber past 1.3, green in
    // the middle. Every one of those ratios now renders the same way.
    const colourOf = (acwr) => {
      const h = render({ plan: weeklyPlan({ metrics: { thisWeekSRPE: 1215, acwr } }) });
      // The context tile that carries the ratio, and the colours in it.
      const tile = h.slice(h.indexOf("week load"), h.indexOf("week type"));
      return [...tile.matchAll(/color:(#[0-9a-f]{3,6})/gi)].map(m => m[1].toLowerCase()).join(",");
    };
    const baseline = colourOf(1.0);
    for (const acwr of [0.4, 0.7, 1.3, 1.4, 1.6, 3.2, null]) {
      expect(colourOf(acwr), `ratio ${acwr} is painted differently`).toBe(baseline);
    }
  });

  it("emits no medicalised categorical label from the ratio, at any value", () => {
    for (const acwr of [0.4, 0.7, 1.0, 1.3, 1.4, 1.6, 3.2, null]) {
      const h = render({ plan: weeklyPlan({ metrics: { thisWeekSRPE: 1215, acwr } }) });
      expect(h).not.toMatch(/optimal|underload|danger|caution|push more|ease up|injury risk|safe zone/i);
    }
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

describe("PlanScreen — block completion", () => {
  const completedPlan = () => weeklyPlan({
    framework: buildWeeklyFramework({
      blockWeek: 8, blockNumber: 1, blockId: "blk-2026-03-16-1",
      blockStartWeekKey: "2026-03-16", blockStatus: "completed", needsNewBlock: true,
    }),
  });

  it("says the block is complete and that a new one never starts on its own", () => {
    const html = render({ plan: completedPlan(), onStartNextBlock: () => {} });
    expect(html).toContain("Block 1 complete");
    expect(html).toContain("a new block never starts on its own");
    expect(html).toContain("Start the next block");
  });

  it("shows no such card while the block is still running", () => {
    const html = render({ plan: weeklyPlan(), onStartNextBlock: () => {} });
    expect(html).not.toContain("complete");
    expect(html).not.toContain("Start the next block");
  });

  it("omits the action when no handler is supplied", () => {
    const html = render({ plan: completedPlan() });
    expect(html).toContain("Block 1 complete");
    expect(html).not.toContain("Start the next block");
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

// ─── MOVEMENT-QUALITY PICKER ─────────────────────────────────────────────────
// The progression gate reads the newest completed session's movement quality,
// so if this picker ever stops rendering, or stops being passed through, the
// gate silently falls back to "unknown" for every session from then on — a
// regression with no error and no visible symptom until a block of plans
// quietly stops progressing.
//
// IT IS NOT REACHABLE BY A STATIC RENDER. The picker only appears once the
// athlete taps "log the session", which flips SessionCard's local `finishing`
// state; renderToStaticMarkup never fires that click. A real interaction test
// would need a DOM environment and a testing-library, and the correction brief
// is explicit that a UI-test framework must not be introduced for this alone.
//
// So what is guarded here is everything short of the click: the option set the
// gate reads, and the wiring in the component source. progressionGate's own
// behaviour — good / mixed / poor / unknown, and pain overriding independently
// — is covered directly in weeklyPlanCore.test.js.
describe("PlanScreen — the movement-quality picker", () => {
  const source = fs.readFileSync(path.resolve("src/screens/PlanScreen.jsx"), "utf8");

  it("offers exactly the three values the progression gate reads", () => {
    expect(MOVEMENT_QUALITY_OPTIONS.map(o => o.value))
      .toEqual([MOVEMENT_QUALITY.GOOD, MOVEMENT_QUALITY.MIXED, MOVEMENT_QUALITY.POOR]);
    // `unknown` is deliberately NOT offered: it is what a session that was
    // never rated resolves to, not something the athlete can pick.
    expect(MOVEMENT_QUALITY_OPTIONS.map(o => o.value)).not.toContain(MOVEMENT_QUALITY.UNKNOWN);
    // Every option carries the words the athlete actually reads.
    for (const o of MOVEMENT_QUALITY_OPTIONS) {
      expect(o.label).toBeTruthy();
      expect(o.hint).toBeTruthy();
    }
  });

  it("renders the picker from the shared option list, not a hand-written copy", () => {
    expect(source).toContain("MOVEMENT_QUALITY_OPTIONS.map");
    expect(source).toContain("Movement quality");
    // A second, divergent list of labels in the component is the failure mode
    // this catches: the gate would read machine values the UI never sends.
    expect(source).not.toMatch(/\[\s*"Good"\s*,\s*"Mixed"\s*,\s*"Poor"\s*\]/);
  });

  it("starts unselected, so an unanswered question is never sent as good", () => {
    // No default. weeklyPlanCore only stores the field when it was answered,
    // and readMovementQuality resolves a missing one to `unknown` — which the
    // gate treats as "do not assume technique was clean", never as good.
    expect(source).toContain("const [movementQuality, setMovementQuality] = useState(null)");
  });

  it("passes the rating through to onFinishSession", () => {
    expect(source).toMatch(/onFinishSession\(\s*session\.id\s*,\s*difficulty\s*,\s*painNote\.trim\(\)\s*,\s*movementQuality\s*\)/);
  });
});
