/**
 * Fresh-DB harness prep (#141) — runs as part of the API server's
 * webServer command (Playwright starts webServers BEFORE globalSetup,
 * so preparation must happen inside the server launch chain):
 *
 *   1. Wipe the dedicated temp dir (tmpdir()/pacsviewer-e2e).
 *   2. Generate synthetic fixtures (JPEGs + DICOM) — no real patient data.
 *   3. `db:push` + `db:seed` against a temp DATABASE_URL with a
 *      deterministic INITIAL_ADMIN_PASSWORD.
 *
 * playwright.config.ts then launches the API server with the SAME
 * DATABASE_URL, so the suite always runs against this fresh DB.
 */
import { execSync } from 'node:child_process';
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const DB_DIR = join(tmpdir(), 'pacsviewer-e2e');
export const DB_PATH = join(DB_DIR, 'fresh.db');

function run(cmd: string, cwd: string, extraEnv: Record<string, string> = {}) {
  console.log(`[fresh-db] ${cmd} (cwd=${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
}

rmSync(DB_DIR, { recursive: true, force: true });
mkdirSync(DB_DIR, { recursive: true });

// Synthetic fixtures (JPEGs + minimal DICOM via the repo's converter)
run('bun run tests/e2e/fixtures/generate-fixtures.ts', ROOT);

// Schema + deterministic seed data
const seedEnv = {
  DATABASE_URL: DB_PATH,
  INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD || 'admin123',
};
run('bun run db:push', join(ROOT, 'apps/server'), seedEnv);
if (!existsSync(DB_PATH)) throw new Error(`db:push did not create ${DB_PATH}`);
run('bun run db:seed', join(ROOT, 'apps/server'), seedEnv);
console.log('[fresh-db] ready');
