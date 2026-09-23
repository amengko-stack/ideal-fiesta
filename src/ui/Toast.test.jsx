import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Toast from "./Toast.jsx";
// A literal, not an import: orchestrator.js pulls in firebase.js.
const LONG = "Weekly review failed after saving the new plan. Check the Plan tab.";

// The toast is how a failed Run-now tells the family it failed, so it must be
// readable at phone width. It used to be one centred `nowrap` line, which cut
// BOTH ends off any message wider than the screen.
describe("Toast", () => {
  it("renders nothing without a message", () => {
    expect(renderToStaticMarkup(<Toast message={null} />)).toBe("");
  });

  it("wraps a long message inside the screen instead of overflowing both edges", () => {
    const html = renderToStaticMarkup(<Toast message={LONG} />);
    expect(html).toContain(LONG);
    expect(html).toContain("white-space:normal");
    expect(html).toContain("max-width:calc(100vw - 32px)");
    expect(html).toContain("width:max-content");
    expect(html).not.toContain("nowrap");
  });
});
