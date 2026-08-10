---
name: health-check
description: Weekly automated health sweep of this repo — tests, lint, dependency advisories, deploy status and a headless UI smoke test — reporting findings as a single pull request.
---

# Weekly health check

Run by a scheduled Routine, Mondays at 08:07 Jakarta (`7 1 * * 1` UTC). Each
run starts in a cold container: nothing is carried over from the previous week,
so this file is the whole memory.

The output of a run is **at most one pull request**, or nothing at all. Nothing
at all is the expected result on a quiet week — do not manufacture a finding to
justify the run.

## Run the checklist

1. **Install.** `npm ci` at the repo root. `node_modules` is never present in a
   fresh container, so this is mandatory, not a fast path to skip.

2. **Tests.** `npm test` (vitest, 21 files / 418 tests). Compare against the
   known-failing list below — only *new* failures are findings.

3. **Lint.** `npm run lint`. Compare the totals against the baseline below.

4. **Dependencies.** `npm outdated` and `npm audit` at the root, then again in
   `functions/` — it is a separate package with its own lockfile and is easy to
   forget. Note that `cd functions` persists across shell calls here; use
   absolute paths afterwards or you will silently run the next command in the
   wrong directory.

5. **Deploy state.** Read the most recent `deploy.yml` run with
   `mcp__github__actions_list`. If it failed, pull the logs with
   `mcp__github__get_job_logs` and diagnose. Remember that the workflow's
   `npm test` step has no `continue-on-error` — a failing test blocks the
   deploy outright, which makes a red test suite an urgent finding, not a
   cosmetic one.

6. **UI smoke test.** Follow `.claude/skills/verify/SKILL.md` — it has the
   working Playwright recipe (dummy `.env.local`, temporary harness mounting
   `MobileApp` behind the auth gate, `/opt/pw-browsers/chromium`) and, more
   importantly, its gotchas section. Do not re-derive that recipe; if it has
   drifted, fix the verify skill rather than duplicating a second copy here.
   Assert on a real element or take a screenshot — a blank page that throws no
   error must not read as a pass. Delete the harness files before committing.

7. **Report.** Apply the guardrails, then open one PR or finish silently.

## Guardrails

- **Never push to `claude/general-assistance-jpgfB`.** That branch *is*
  production — `deploy.yml` fires on push to it. Work on
  `claude/health-check-YYYY-MM-DD` and open a PR against the production branch.
- **Never merge.** No `merge_pull_request`, no auto-merge, no exceptions. Every
  fix is reviewed by a human.
- **One PR per run, one concern per PR.** If the week turns up four things,
  fix the most important one and list the rest in the PR body. Without this
  rule the first run opens a dependency-bump avalanche nobody reviews.
- **Major version bumps are reported, never applied.** This project already
  tracks React 19, Vite 8 and ESLint 10. An unattended major bump breaks the
  build, and the breakage lands on a branch nobody is watching.
- **No mass lint cleanup.** The backlog below is deliberate and predates this
  agent. Fix regressions against the baseline; leave the rest.
- **Never put a secret value in a PR body or a log line.** `deploy.yml`'s
  secret check is boolean-only on purpose — preserve that property. Report
  *that* something is missing, never *what* it is.
- **Silence is a valid outcome.** No PR, no issue, no comment, no "all clear"
  notification.

## Baseline as of 2026-08-07

Update these numbers in the same PR that changes them, so the next run compares
against the truth.

**Known-failing tests: none.** All 21 files / 418 tests pass.

The suite is also clock-independent, which is worth preserving deliberately.
`calculateMetrics`, `describeInjury` and `recurringAreas` used to read
`new Date()` internally, so fixtures pinned to literal dates silently rotted as
the calendar advanced — five tests were failing or armed to fail on a day
nobody had touched the code. Each now takes an optional trailing reference date
(`ref` / `today`) that defaults to the clock for app callers, and the tests pass
one explicitly.

To check this property has held, run the suite against a future clock:

```sh
cat > tmp-clock-setup.js <<'EOF'
import { vi, beforeAll, afterAll } from "vitest";
beforeAll(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date("2031-11-20T09:00:00")); });
afterAll(() => { vi.useRealTimers(); });
EOF
cat > tmp-clock.config.js <<'EOF'
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { setupFiles: ["./tmp-clock-setup.js"] } });
EOF
npx vitest run --config ./tmp-clock.config.js   # expect 418 passed
rm tmp-clock-setup.js tmp-clock.config.js
```

A test that passes today and fails under that clock is a time bomb, not a
flake — report it as one. Note that `getWeekBounds` (`src/lib/dates.js:11`)
still reads the clock internally, so `computeLoad`, ACWR and
`computeLoadHistory` retain the dependency; nothing currently tests them
against a fixed date, and threading a reference through reaches every load
caller.

**Lint: 24 problems (17 errors, 7 warnings).** Mostly `no-unused-vars` and
`react-hooks/set-state-in-effect`. `deploy.yml` marks lint `continue-on-error`
because of this backlog.

**Dependency advisories: 11 at the root, 12 in `functions/`.** Several are
critical (`shell-quote` via `concurrently`, `websocket-driver`). Most sit in
dev/transitive dependencies rather than in shipped client code — check whether
a given advisory actually reaches the browser bundle before ranking it above a
failing test.

## Writing the PR

Lead with what broke and what it costs the user — a blocked deploy or a
mis-fired injury reminder, not "test failure in injuries.test.js". Say what you
changed and what you deliberately left alone. If a finding is reported rather
than fixed, say why in one line.

End the PR body with the attribution footer:

```
---
_Generated by [Claude Code](https://claude.ai/code)_
```
