// Local dev + Playwright E2E server. Serves the exact same Express app that the
// production Cloud Function wraps, so dev and prod share one code path.
// Run with mock flags for offline testing:
//   MOCK_AI=1 STRAVA_MOCK=1 WHOOP_MOCK=1 node dev-server.cjs
try { require("dotenv/config"); } catch { /* dotenv optional; E2E passes env inline */ }
const { createApiApp } = require("./functions/apiApp");

const app = createApiApp();
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Running-plan API on http://localhost:${PORT}`));
