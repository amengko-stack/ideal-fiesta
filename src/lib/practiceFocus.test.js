import { describe, it, expect } from "vitest";
import {
  weeklyFocus, focusPracticeSuggestion, sessionAddressedPriority,
  practiceEvidence, focusStreakText,
} from "./practiceFocus.js";

// The Firebase-free guarantee for this module is enforced repo-wide by the
// transitive import guard in athleteMemoryCore.test.js.

const priority = (over = {}) => ({
  id: "p1", priority: "Second serve consistency", key: "second_serve",
  status: "active", weeksDeferredCount: 1, ...over,
});

const today = () => {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

describe("weeklyFocus", () => {
  it("returns null when there are no active priorities", () => {
    expect(weeklyFocus([])).toBeNull();
    expect(weeklyFocus(null)).toBeNull();
    expect(weeklyFocus([{ status: "resolved" }])).toBeNull();
  });

  it("puts an escalated priority ahead of a longer-deferred active one", () => {
    const active = priority({ id: "a", status: "active", weeksDeferredCount: 6 });
    const escalated = priority({ id: "b", status: "escalated", weeksDeferredCount: 4 });
    expect(weeklyFocus([active, escalated]).id).toBe("b");
  });

  it("among equal status, picks the longest-deferred", () => {
    const short = priority({ id: "a", weeksDeferredCount: 1 });
    const long = priority({ id: "b", weeksDeferredCount: 5 });
    expect(weeklyFocus([short, long]).id).toBe("b");
  });

  it("ignores resolved/superseded priorities mixed into the list", () => {
    const resolved = priority({ id: "r", status: "resolved", weeksDeferredCount: 99 });
    const active = priority({ id: "a", status: "active", weeksDeferredCount: 1 });
    expect(weeklyFocus([resolved, active]).id).toBe("a");
  });
});

describe("focusPracticeSuggestion", () => {
  it("maps a known taxonomy key to a concrete suggestion", () => {
    expect(focusPracticeSuggestion(priority({ key: "second_serve" }))).toMatch(/second serve/i);
    expect(focusPracticeSuggestion(priority({ key: "net_play" }))).toMatch(/volley/i);
  });

  it("falls back to a generic suggestion using the priority's own label for other/unknown keys", () => {
    const other = priority({ key: "other", priority: "Court positioning after the serve" });
    expect(focusPracticeSuggestion(other)).toContain("Court positioning after the serve");

    const unknown = priority({ key: "not_a_real_key", priority: "Some new thing" });
    expect(focusPracticeSuggestion(unknown)).toContain("Some new thing");
  });

  it("survives a missing priority label", () => {
    expect(focusPracticeSuggestion({ key: "other" })).toBeTruthy();
  });
});

describe("sessionAddressedPriority", () => {
  it("matches a session focus that names the key's own label", () => {
    const log = { focus: "Serve practice", type: "tennis" };
    expect(sessionAddressedPriority(log, priority({ key: "second_serve", priority: "Second serve" }))).toBe(false);
    // key label is "Second serve" — must appear in text
    const closer = { focus: "Second serve targets" };
    expect(sessionAddressedPriority(closer, priority({ key: "second_serve" }))).toBe(true);
  });

  it("matches a reworded focus string against a label-only priority", () => {
    const p = { priority: "Improve second serve reliability", key: null };
    const log = { focus: "Worked on second serve consistency today" };
    expect(sessionAddressedPriority(log, p)).toBe(true);
  });

  it("considers sportName and notes, not just focus", () => {
    const p = priority({ key: "net_play", priority: "Net play / approach" });
    expect(sessionAddressedPriority({ notes: "lots of net play and volleys" }, p)).toBe(true);
  });

  it("returns false for unrelated or empty text", () => {
    const p = priority({ key: "second_serve" });
    expect(sessionAddressedPriority({ focus: "Baseline rallying" }, p)).toBe(false);
    expect(sessionAddressedPriority({ focus: "" }, p)).toBe(false);
    expect(sessionAddressedPriority(null, p)).toBe(false);
    expect(sessionAddressedPriority({ focus: "Second serve" }, null)).toBe(false);
  });
});

describe("practiceEvidence", () => {
  const p = priority({ key: "second_serve", priority: "Second serve" });

  it("counts matching sessions within the window and reports the last date", () => {
    const logs = [
      { date: daysAgo(2), focus: "Second serve targets" },
      { date: daysAgo(10), focus: "Second serve consistency" },
      { date: daysAgo(40), focus: "Second serve" }, // outside default 28-day window
      { date: daysAgo(3), focus: "Baseline rallying" }, // unrelated
    ];
    const ev = practiceEvidence(logs, p);
    expect(ev.count).toBe(2);
    expect(ev.lastDate).toBe(daysAgo(2));
    expect(ev.days).toBe(2);
  });

  it("honours a custom withinDays boundary", () => {
    const logs = [{ date: daysAgo(29), focus: "Second serve" }];
    expect(practiceEvidence(logs, p, { withinDays: 28 }).count).toBe(0);
    expect(practiceEvidence(logs, p, { withinDays: 30 }).count).toBe(1);
  });

  it("counts distinct days, not sessions, for the day count", () => {
    const logs = [
      { date: today(), focus: "Second serve" },
      { date: today(), focus: "Second serve" },
    ];
    const ev = practiceEvidence(logs, p);
    expect(ev.count).toBe(2);
    expect(ev.days).toBe(1);
  });

  it("ignores sessions with no date and never returns NaN", () => {
    const logs = [{ focus: "Second serve" }, { date: null, focus: "Second serve" }];
    const ev = practiceEvidence(logs, p);
    expect(ev.count).toBe(0);
    expect(Number.isNaN(ev.days)).toBe(false);
  });

  it("is safe with malformed/missing input", () => {
    expect(practiceEvidence(null, p)).toEqual({ count: 0, lastDate: null, days: 0 });
    expect(practiceEvidence([], p)).toEqual({ count: 0, lastDate: null, days: 0 });
    expect(practiceEvidence([{ date: today(), focus: "Second serve" }], null))
      .toEqual({ count: 0, lastDate: null, days: 0 });
  });
});

describe("focusStreakText", () => {
  it("renders a clear no-evidence message", () => {
    expect(focusStreakText({ count: 0, lastDate: null, days: 0 })).toBe("Not practised yet");
    expect(focusStreakText(null)).toBe("Not practised yet");
  });

  it("renders count and last date when there is evidence", () => {
    expect(focusStreakText({ count: 3, lastDate: "2026-07-30", days: 3 }))
      .toBe("Practised 3× in the last 4 weeks — last on 2026-07-30");
  });
});
