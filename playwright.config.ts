/**
 * Playwright E2E config — 1.0 release gate (#141).
 *
 * Fresh-DB harness mechanism (reproducible runs, per issue #141 resolution):
 *   1. The API server webServer command FIRST runs
 *      `tests/e2e/prepare-fresh-db.ts`, which wipes a dedicated temp dir,
 *      generates synthetic fixtures (JPEGs + a real DICOM built through the
 *      repo's image-to-dicom service), then runs `db:push` + `db:seed`
 *      against a temp DATABASE_URL that lives ONLY inside that temp dir.
 *      (Playwright starts webServers BEFORE globalSetup, so the preparation
 *      must live inside the server launch chain.)
 *   2. The API server is then launched with the SAME DATABASE_URL, so the
 *      suite always sees a freshly seeded database.
 *   3. Deterministic admin credentials come from INITIAL_ADMIN_PASSWORD
 *      (default `admin123`). The dev-path seed honours this env var
 *      (see apps/server/src/db/seed.ts) and does NOT set mustChangePassword
 *      (that only happens in the NODE_ENV=production minimal-seed path),
 *      so the seeded admin can be used directly by every spec via
 *      `tests/e2e/helpers.ts`.
 *
 * Port strategy: ports 3000/5173 are frequently occupied by dev servers on
 * dev machines, so the harness uses PORT=3100 (API) and 5180 (Vite dev
 * server, proxying /api to 3100 via VITE_PROXY_TARGET).
 */
import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const E2E_DB_PATH = join(tmpdir(), 'pacsviewer-e2e', 'fresh.db');
export const API_PORT = Number(process.env.E2E_API_PORT || 3100);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5180);
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  timeout: 120_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      // Fresh-DB harness (#141): prepare temp DB (db:push + db:seed with
      // deterministic INITIAL_ADMIN_PASSWORD) BEFORE starting the API server
      // against it.
      command: `bun run tests/e2e/prepare-fresh-db.ts && cd apps/server && DATABASE_URL=${E2E_DB_PATH} PORT=${API_PORT} bun run src/index.ts`,
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // Vite dev server on a non-conflicting port, proxying /api → API server.
      command: `cd apps/web && VITE_PROXY_TARGET=http://localhost:${API_PORT} bun run dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { VITE_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
