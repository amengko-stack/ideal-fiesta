// ─── STROKE TAXONOMY ─────────────────────────────────────────────────────────
// Shared by the classic TechnicalTab and the new StrokeSheet.

export const STROKE_AREAS = {
  Groundstrokes: ["Forehand Drive", "Forehand Kinetic Chain", "Backhand Drive", "Backhand Kinetic Chain", "Forehand Slice", "Backhand Slice"],
  Serve:         ["First Serve", "Second Serve", "Serve Toss & Rhythm"],
  Return:        ["Forehand Return", "Backhand Return"],
  "Net Play":    ["Forehand Volley", "Backhand Volley", "Overhead", "Approach Shot"],
  Movement:      ["Split Step Timing", "Lateral Movement & Recovery", "First-Step Explosiveness", "Deceleration & Balance"],
  Specialty:     ["Drop Shot", "Lob", "Passing Shots"],
};

export const ASSESSMENT_SOURCES = ["Video Analysis", "Court Coach", "Match Observation", "Self"];

// Category (Groundstrokes/Serve/…) for a given stroke area.
export function categoryOf(strokeArea) {
  return Object.entries(STROKE_AREAS).find(([, areas]) => areas.includes(strokeArea))?.[0] ?? "";
}
