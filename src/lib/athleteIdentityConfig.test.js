import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ─── THE APP IS ATHLETE-CONFIGURABLE ─────────────────────────────────────────
// A repo-level guard, not a unit test, because the defect it exists for is a
// repo-level one: a person's name appearing in a screen or an AI prompt. The
// fix for that is never "swap in a different person's name" — it is that the
// name comes from `profile.name`, so a second family could use this app
// without editing source.
//
// TWO THINGS ARE DELIBERATELY DIFFERENT HERE.
//
// 1. Capitalised `Valissa` / `Marsha` are NAMES. They are forbidden in every
//    production path.
// 2. Lowercase `valissa`, `valissaName`, `valissaWinPct`, `valissaWins` are
//    LEGACY PERSISTED FIELD KEYS. They are the storage field names every
//    .matchtrack import ever written uses for the athlete's own stats, and
//    every historical match document in Firestore is keyed on them. Renaming
//    them would orphan that history for no user-visible gain, so they stay —
//    and this test pins the distinction so nobody "fixes" them by accident.

const REPO = path.resolve(".");

const PRODUCTION_ROOTS = [
  { dir: path.join(REPO, "src"), exts: [".js", ".jsx"] },
  // The deployed Cloud Functions themselves (functions/shared is a generated
  // mirror of src/lib, already covered above).
  { dir: path.join(REPO, "functions"), exts: [".js"], shallow: true },
];

// Test files and fixtures may use any name they like — the point of a fixture
// is to stand in for a real athlete.
const isExcluded = (file) =>
  /\.test\.(js|jsx)$/.test(file) || file.includes("__fixtures__");

function walk(dir, exts, shallow) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shallow || entry.name === "node_modules") continue;
      out.push(...walk(full, exts, false));
    } else if (exts.includes(path.extname(entry.name)) && !isExcluded(full)) {
      out.push(full);
    }
  }
  return out;
}

const productionFiles = PRODUCTION_ROOTS.flatMap(r => walk(r.dir, r.exts, r.shallow));

const hits = (re) => {
  const found = [];
  for (const file of productionFiles) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (re.test(line)) found.push(`${path.relative(REPO, file)}:${i + 1}  ${line.trim()}`);
    });
  }
  return found;
};

describe("no production path hardcodes an athlete's name", () => {
  it("scans a non-trivial number of production files", () => {
    // Guards the guard: a broken walk() would make every assertion below pass.
    expect(productionFiles.length).toBeGreaterThan(50);
    expect(productionFiles.some(f => f.endsWith("planGenCore.js"))).toBe(true);
    expect(productionFiles.some(f => f.endsWith("MatchDetailSheet.jsx"))).toBe(true);
  });

  it("contains no capitalised `Valissa` anywhere in production source", () => {
    expect(hits(/\bValissa\b/)).toEqual([]);
  });

  it("does not replace it with a different hardcoded name either", () => {
    expect(hits(/\bMarsha\b/)).toEqual([]);
  });

  it("still uses the legacy `valissa*` storage keys, which are not names", () => {
    // If this ever goes to zero, someone renamed the persisted fields and every
    // historical match document stopped reading back.
    const legacy = hits(/\bvalissa(Name|WinPct|Wins)?\b/);
    expect(legacy.length).toBeGreaterThan(0);
    // Every one of them must be lowercase — a field key, never display text.
    for (const line of legacy) expect(line).not.toMatch(/\bValissa\b/);
  });

  it("reads the athlete's name from the profile in the paths that show one", () => {
    const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
    // AI prompts
    expect(read("src/athlete/AVLogSession.jsx")).toContain("profile?.name");
    expect(read("src/lib/matchAnalysis.js")).toContain("context.athleteProfile?.name");
    expect(read("src/lib/seasonReport.js")).toContain("${identity.name}");
    // Screens
    expect(read("src/screens/MatchDetailSheet.jsx")).toContain("athleteName || match.valissaName");
    expect(read("src/tabs/MatchDetail.jsx")).toContain("athleteName || match.valissaName");
    expect(read("src/tabs/MatchesTab.jsx")).toContain("profile?.name");
  });
});

describe("cross-training is generic, and legacy cheer data still reads", () => {
  it("shows no live `Cheer` category in any production screen", () => {
    // The quoted display label, not the `cheer` storage value or the M.cheer
    // colour slot.
    expect(hits(/["'`]\s*(📣\s*)?Cheer\s*["'`]/)).toEqual([]);
    expect(hits(/\bcheerleading\b/i).filter(l => !/legacy|historical|no longer|older logs/i.test(l))).toEqual([]);
  });

  it("still accepts the legacy `cheer` type and the `cheerSchedule` field", () => {
    expect(hits(/\bcheerSchedule\b/).length).toBeGreaterThan(0);
    expect(hits(/["']cheer["']/).length).toBeGreaterThan(0);
  });
});
