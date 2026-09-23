// ─── SECRETS ─────────────────────────────────────────────────────────────────
// The Anthropic key lives in Google Secret Manager, not in the function's
// environment. It used to be a plain environment variable (loaded from the
// gitignored functions/.env at deploy time), which put it in cleartext in the
// function's configuration — readable by anyone with read access to the
// project, e.g. through `firebase functions:list --json`.
//
// A function that names the secret in runWith({ secrets }) gets it mounted as
// process.env.ANTHROPIC_API_KEY at runtime, so anthropic.js and the `api`
// proxy read it exactly as before. A function that does NOT name it never
// sees it — sendCheckinReminder makes no model call and is left without.
//
// Set or rotate it (prompts for the value; nothing lands in a file or shell
// history), then redeploy the functions that use it:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
//
// The name must NOT also appear in functions/.env: the CLI refuses to deploy a
// key that is both a secret and a plain environment variable.
export const ANTHROPIC_API_KEY = 'ANTHROPIC_API_KEY';
export const ANTHROPIC_SECRETS = [ANTHROPIC_API_KEY];
