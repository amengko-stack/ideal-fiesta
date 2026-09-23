// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { useState, act } from "react";
import { createRoot } from "react-dom/client";
import PlanScreen from "./PlanScreen.jsx";
import { buildWeeklyFramework, buildWeeklyPlanDoc, MOVEMENT_QUALITY } from "../lib/weeklyPlanCore.js";

// ─── MOVEMENT QUALITY — DRIVEN THROUGH THE REAL SCREEN ───────────────────────
// PlanScreen.test.jsx pins the movement-quality wiring by reading the source.
// This file drives it the way the family does, in a DOM: tick an exercise,
// open "Finish & log", pick (or skip) a rating, press "Log". What leaves the
// screen is exactly what MobileApp.finishSession persists and what the next
// week's progression gate reads, so the assertions are on that call.
//
// The harness owns the plan the way MobileApp does — onToggleExercise flips
// the session's doneMap — so the Finish button appears only because an
// exercise was really ticked, not because a fixture pretended one was.

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

let container;
let root;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = root = null;
});

const basePlan = () => buildWeeklyPlanDoc({
  weekKey: "2026-09-21",
  framework: buildWeeklyFramework({ blockWeek: 1, blockNumber: 1 }),
  generatedAt: "2026-09-20T02:00:00.000Z",
  growthContext: null,
  metrics: { thisWeekSRPE: 1200 },
  coachNote: "Steady week.",
  athleteNote: "Nice work!",
  rationales: { briefing: "Learn the patterns." },
});

function Harness({ onFinishSession }) {
  const [plan, setPlan] = useState(basePlan);
  const onToggleExercise = (sessionId, exId) => setPlan(p => ({
    ...p,
    sessions: p.sessions.map(s => s.id !== sessionId ? s
      : { ...s, doneMap: { ...(s.doneMap || {}), [exId]: !s.doneMap?.[exId] } }),
  }));
  return (
    <PlanScreen
      plan={plan} tournaments={[]} loading={false} error={null}
      onGenerate={() => {}} onRegenerate={() => {}}
      onToggleExercise={onToggleExercise} onFinishSession={onFinishSession}
    />
  );
}

function mount() {
  const onFinishSession = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness onFinishSession={onFinishSession} />));
  return onFinishSession;
}

// The screen's buttons are plain divs, so find the innermost element whose own
// text is exactly the label.
function byText(text) {
  const hits = [...container.querySelectorAll("div, span")]
    .filter(el => el.textContent.trim() === text)
    .filter(el => ![...el.children].some(c => c.textContent.trim() === text));
  if (hits.length === 0) throw new Error(`no element with text ${JSON.stringify(text)}`);
  return hits;
}
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const has = (text) => { try { byText(text); return true; } catch { return false; } };

const plan = basePlan();
const A = plan.sessions.find(s => s.id === "A");
const firstExercise = A.exercises[0].name;

function tickAndOpenFinish() {
  expect(has("Finish & log Session A 💪")).toBe(false);
  click(byText(firstExercise)[0]);
  expect(has("Finish & log Session A 💪")).toBe(true);
  click(byText("Finish & log Session A 💪")[0]);
  expect(has("Movement quality")).toBe(true);
}

describe("Plan screen — movement quality through the real finish flow", () => {
  it.each([
    ["Good", MOVEMENT_QUALITY.GOOD],
    ["Mixed", MOVEMENT_QUALITY.MIXED],
    ["Poor", MOVEMENT_QUALITY.POOR],
  ])("picking %s logs Session A with that rating", (label, value) => {
    const onFinishSession = mount();
    tickAndOpenFinish();
    click(byText(label)[0]);
    click(byText("Log Session A ✓")[0]);
    expect(onFinishSession).toHaveBeenCalledTimes(1);
    const [sessionId, difficulty, painNote, movementQuality] = onFinishSession.mock.calls[0];
    expect(sessionId).toBe("A");
    expect(difficulty).toBe(3);
    expect(painNote).toBe("");
    expect(movementQuality).toBe(value);
  });

  it("logging without answering stores NO rating — never a silent 'good'", () => {
    const onFinishSession = mount();
    tickAndOpenFinish();
    click(byText("Log Session A ✓")[0]);
    expect(onFinishSession).toHaveBeenCalledTimes(1);
    expect(onFinishSession.mock.calls[0][3]).toBeNull();
  });

  it("the last rating tapped wins, and difficulty and pain note travel with it", () => {
    const onFinishSession = mount();
    tickAndOpenFinish();
    click(byText("Good")[0]);
    click(byText("Poor")[0]);
    const stars = byText("★");
    click(stars[4]);
    const input = container.querySelector('input[type="text"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "  right knee tight  ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(byText("Log Session A ✓")[0]);
    expect(onFinishSession.mock.calls[0]).toEqual(["A", 5, "right knee tight", MOVEMENT_QUALITY.POOR]);
  });

  it("offers no 'not rated' option to pick — unknown is only ever the absence of an answer", () => {
    mount();
    tickAndOpenFinish();
    for (const label of ["Good", "Mixed", "Poor"]) expect(has(label)).toBe(true);
    expect(has("Unknown")).toBe(false);
    expect(has("Not rated")).toBe(false);
  });
});
