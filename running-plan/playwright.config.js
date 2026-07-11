import { defineConfig } from '@playwright/test';

// E2E runs against the dev servers in demo/mock mode:
//   MOCK_AI=1 STRAVA_MOCK=1 WHOOP_MOCK=1 node ../server.js   (port 3001)
//   VITE_DEMO=1 vite                                          (port 3002)
// Both are started automatically via webServer below.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3002/running/',
    screenshot: 'only-on-failure',
    // Use the system Chromium when the exact Playwright browser build isn't
    // downloaded (e.g. sandboxed CI); falls back to the default otherwise.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  webServer: [
    {
      command: 'node ../server.js',
      port: 3001,
      reuseExistingServer: true,
      env: { MOCK_AI: '1', STRAVA_MOCK: '1', WHOOP_MOCK: '1' },
    },
    {
      command: 'npx vite --port 3002 --strictPort',
      port: 3002,
      reuseExistingServer: true,
      env: { VITE_DEMO: '1' },
    },
  ],
});
