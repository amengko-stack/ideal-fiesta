---
name: release-notes
description: Use when the user asks for release notes, a changelog, or "what shipped" for athlete-os since the last deploy.
disable-model-invocation: true
---

# Release notes for athlete-os

Generates release notes from commits since the last successful Firebase
deploy. There's no git-tag or CHANGELOG convention here (`package.json`
version is a static `0.0.0`), so "the last release" is defined as the last
commit `deploy.yml` (GitHub Actions → Firebase Hosting) actually shipped.

## Procedure

1. **Find the last deployed commit:**
   ```
   gh run list --workflow=deploy.yml --status=success --limit 1 --json headSha,createdAt
   ```
   If `gh` isn't authenticated or the workflow never succeeded, ask the user
   for a reference point instead (a tag, SHA, or "since <date>") — don't guess.

2. **Fetch that commit and verify direction before diffing:**
   ```
   git fetch origin <headSha>
   git merge-base --is-ancestor <headSha> HEAD && echo ok || echo behind
   ```
   The deploy SHA is often not present in a local checkout at all — fetch it
   explicitly by SHA rather than assuming `git log` can already see it. If the
   ancestor check prints `behind`, your local branch hasn't caught up with
   what was actually deployed (or you're on a different branch than the one
   `deploy.yml` ran on) — say so and suggest `git pull` / checking out the
   deployed branch, rather than silently reporting zero commits.

3. **Get commits since that SHA:**
   ```
   git log <headSha>..HEAD --pretty=format:'%h %s' --no-merges
   ```

4. **Group into sections** by reading each commit message and the diff for
   any commit whose subject is unclear — don't rely on subject line alone
   for user-facing wording:
   - **Features** — new capability a user or athlete would notice
   - **Fixes** — bug fixes
   - **Chores / infra** — deploy, dependency, refactor, test-only changes
     (keep this section terse; it's for the team, not end users)

5. **Write the notes** in Markdown, most-impactful section first. Skip empty
   sections. Attribute nothing to "Claude" — this is the project's changelog,
   not a session summary.

6. **Output** to the chat by default. If the user wants it saved, write to
   `CHANGELOG.md` at the repo root (create it if absent, newest release on
   top) — ask which they want if unclear.

## Common mistakes

- Don't skip the fetch-and-ancestor-check in step 2 — a local checkout can be
  behind what actually deployed, and `git log <sha>..HEAD` fails silently
  (empty output, no error) when the range direction is backwards instead of
  telling you HEAD is stale.
- Don't use `git log --since=<date>` — commit dates and deploy timing drift;
  the deploy-SHA boundary from step 1 is exact, a date filter isn't.
- Don't count merge commits as shipped work (`--no-merges` above) — they'd
  double-list commits already summarized individually.
- Don't invent a version number; this project doesn't use one.
