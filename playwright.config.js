// Playwright config for GreenPath browser E2E (tests/e2e).
//
// Boots the real Flask server (server.py) and runs the specs against it. No
// OPENAI_API_KEY is required or set here on purpose: every assertion in the
// suite exercises a DETERMINISTIC, server-side path (the attorney-handoff stop,
// SPA navigation, the cross-origin guard, and /api/health), none of which spend
// a single model token. That keeps the E2E run free and reproducible.
//
// This config is intentionally NOT wired into the required CI job: GitHub
// runners do not ship browser binaries, so a fresh checkout must first run
// `npx playwright install --with-deps chromium`. See README ("Browser E2E")
// and the optional `e2e` job in .github/workflows/ci.yml.
import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || '5050';
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;

// The command that boots the server. Defaults to the project virtualenv; CI (or
// a different layout) can override it, e.g. E2E_SERVER_CMD="python server.py".
const SERVER_CMD = process.env.E2E_SERVER_CMD || '.venv/bin/python server.py';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: SERVER_CMD,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Deliberately no OPENAI_API_KEY: the suite only touches deterministic paths.
    env: { PORT: String(PORT), FLASK_DEBUG: 'false', PYTHONUNBUFFERED: '1' },
  },
});
