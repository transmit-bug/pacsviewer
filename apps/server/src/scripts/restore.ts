/**
 * Restore script — replaces the live database with a backup snapshot.
 *
 * Implements docs/research/sqlite-backup-for-1.0.md "Concrete restore steps":
 *   stop server → quarantine current DB → copy snapshot → integrity_check
 *   validation → restart → smoke test.
 *
 * The docker compose stop/start steps are printed for the operator (the
 * backend must be stopped before running this script with --yes).
 *
 * Usage:
 *   bun run src/scripts/restore.ts <snapshot-path | latest>          # dry run
 *   bun run src/scripts/restore.ts <snapshot-path | latest> --yes    # execute
 *
 * Examples:
 *   bun run src/scripts/restore.ts latest
 *   bun run src/scripts/restore.ts data/backups/pacsviewer-2026-08-21T09-00-00-000Z.db --yes
 */

import { Database } from 'bun:sqlite';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DB_PATH = resolve(process.env.DATABASE_URL || './data/pacsviewer.db');
const BACKUP_DIR = resolve(process.env.BACKUP_DIR || join(dirname(DB_PATH), 'backups'));

const args = process.argv.slice(2);
const targetArg = args.find((a) => a !== '--yes');
const execute = args.includes('--yes');

function fail(msg: string): never {
  console.error(`[restore] ERROR: ${msg}`);
  process.exit(1);
}

function resolveSnapshot(): string {
  if (!targetArg) fail('usage: bun run src/scripts/restore.ts <snapshot-path | latest> [--yes]');
  if (targetArg === 'latest') {
    const snapshots = readdirSync(BACKUP_DIR)
      .filter((n) => /^pacsviewer-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/.test(n))
      .sort()
      .reverse();
    if (snapshots.length === 0) fail(`no snapshots found in ${BACKUP_DIR}`);
    return join(BACKUP_DIR, snapshots[0]);
  }
  const p = resolve(targetArg);
  if (!existsSync(p)) fail(`snapshot not found: ${p}`);
  return p;
}

// ── Plan ─────────────────────────────────────────────────────────────────────

const snapshotPath = resolveSnapshot();
const snapshotSize = statSync(snapshotPath).size;
const quarantineName = `pacsviewer-pre-restore-${Math.floor(Date.now() / 1000)}.db`;
const journalPath = `${DB_PATH}-journal`;

console.log('[restore] plan:');
console.log(`  snapshot      : ${snapshotPath} (${(snapshotSize / 1024 / 1024).toFixed(1)} MiB)`);
console.log(`  database      : ${DB_PATH}`);
console.log(`  quarantine to : ${join(BACKUP_DIR, quarantineName)} (+ -journal if present)`);
if (!execute) {
  console.log('\n[restore] dry run — re-run with --yes to execute.');
  console.log('[restore] BEFORE executing, stop the backend:  docker compose stop server');
  process.exit(0);
}

if (!process.env.RESTORE_ALLOW_RUNNING && existsSync(journalPath)) {
  fail(
    'a hot journal exists (data/pacsviewer.db-journal) — the server is likely still ' +
      'running. Stop it first: docker compose stop server. ' +
      '(Set RESTORE_ALLOW_RUNNING=1 to override.)',
  );
}

// ── Execute: stop(done by operator) → quarantine → copy → validate ──────────

mkdirSync(BACKUP_DIR, { recursive: true });

renameSync(DB_PATH, join(BACKUP_DIR, quarantineName));
console.log(`[restore] quarantined current DB → data/backups/${quarantineName}`);
if (existsSync(journalPath)) {
  renameSync(journalPath, join(BACKUP_DIR, `${quarantineName}-journal`));
  console.log('[restore] quarantined stray -journal file alongside it');
}

copyFileSync(snapshotPath, DB_PATH);
chmodSync(DB_PATH, 0o644);
console.log(`[restore] copied snapshot → ${DB_PATH}`);

// Validate before reopening traffic (research doc step 5).
const check = new Database(DB_PATH, { readonly: true });
try {
  const checkRow = check.query('PRAGMA integrity_check').get() as Record<string, string> | undefined;
  const integrity = checkRow ? Object.values(checkRow)[0] : undefined;
  if (integrity !== 'ok') fail(`integrity_check failed on restored DB: ${integrity}`);
  console.log('[restore] integrity_check: ok');

  for (const table of ['patients', 'studies', 'images']) {
    try {
      const row = check.query(`SELECT count(*) AS c FROM ${table}`).get() as { c?: number } | undefined;
      console.log(`[restore] smoke count ${table}: ${row?.c ?? 0}`);
    } catch {
      console.log(`[restore] smoke count ${table}: table missing (empty snapshot?)`);
    }
  }
} finally {
  check.close();
}

console.log(`
[restore] done. Next steps:
  1. Restore image files if needed:
       rsync -a data/backups/images-sync/ data/images/
  2. Restart the backend:  docker compose start server
  3. Smoke-test: log in and open one recent study.
  4. Keep the quarantined DB until confident, then delete it manually.
`);
