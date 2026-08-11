import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SHARED_MODULES } from "../../scripts/sync-functions-shared.mjs";

// This suite guards the src/lib -> functions/shared sync (see
// scripts/sync-functions-shared.mjs and firebase.json's functions predeploy
// hook). Cloud Functions only deploys the functions/ directory, so the
// allowlisted pure modules are physically copied there; these tests catch
// drift (an edited src/lib file whose functions/shared copy wasn't
// re-synced) and catch any allowlisted module drifting away from purity.

const LIB_DIR = path.resolve("src/lib");
const SHARED_DIR = path.resolve("functions/shared");

const FORBIDDEN_PATTERNS = [
  /['"]firebase['"]/,
  /['"]\.\.\/firebase(\.js)?['"]/,
  /['"]\.\/ai\.js['"]/,
  /reminderRules\.json/,
  /import\.meta\.env/,
];

const RELATIVE_IMPORT_RE = /from\s+["'](\.[^"']+)["']/g;

describe("SHARED_MODULES allowlist", () => {
  it("is non-empty", () => {
    expect(SHARED_MODULES.length).toBeGreaterThan(0);
  });
});

describe("functions/shared drift (byte-identical to src/lib)", () => {
  it.each(SHARED_MODULES)("src/lib/%s exists", (name) => {
    expect(fs.existsSync(path.join(LIB_DIR, name))).toBe(true);
  });

  it.each(SHARED_MODULES)("functions/shared/%s exists", (name) => {
    expect(fs.existsSync(path.join(SHARED_DIR, name))).toBe(true);
  });

  it.each(SHARED_MODULES)("functions/shared/%s is byte-identical to src/lib/%s", (name) => {
    const libPath = path.join(LIB_DIR, name);
    const sharedPath = path.join(SHARED_DIR, name);
    if (!fs.existsSync(libPath) || !fs.existsSync(sharedPath)) {
      // Existence is asserted by the tests above; skip the comparison here
      // rather than double-failing with a confusing read error.
      return;
    }
    const libBuf = fs.readFileSync(libPath);
    const sharedBuf = fs.readFileSync(sharedPath);
    expect(sharedBuf.equals(libBuf)).toBe(true);
  });
});

// Strips `//` line comments so prose that merely *mentions* a forbidden
// import (e.g. explaining why the file avoids it) doesn't trip the check —
// only actual code matters here.
const stripLineComments = (src) =>
  src
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");

describe("SHARED_MODULES stay Firebase-free and portable", () => {
  it.each(SHARED_MODULES)("%s has no forbidden imports", (name) => {
    const filePath = path.join(LIB_DIR, name);
    if (!fs.existsSync(filePath)) return;
    const code = stripLineComments(fs.readFileSync(filePath, "utf8"));
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(code).not.toMatch(pattern);
    }
  });
});

describe("SHARED_MODULES are transitively closed", () => {
  const allowlist = new Set(SHARED_MODULES);

  it.each(SHARED_MODULES)("every relative import in %s resolves to another allowlisted module", (name) => {
    const filePath = path.join(LIB_DIR, name);
    if (!fs.existsSync(filePath)) return;
    const src = fs.readFileSync(filePath, "utf8");
    const matches = [...src.matchAll(RELATIVE_IMPORT_RE)];
    for (const [, spec] of matches) {
      // All allowlisted modules live flat in src/lib, so a relative import
      // must resolve to a sibling file in this same directory.
      const base = path.basename(spec);
      expect(allowlist.has(base)).toBe(true);
    }
  });
});
