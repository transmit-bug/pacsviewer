/**
 * Backup job — scheduled `VACUUM INTO` snapshots + image mirror sync.
 *
 * Runs `VACUUM INTO` against the live database (consistency-guaranteed by
 * SQLite core, safe in rollback-journal mode — no app/journal changes needed),
 * prunes old snapshots per the retention policy, and mirrors data/images/
 * into <backupDir>/images-sync/ once per sync interval.
 *
 * Scheduling: host cron/systemd timer (see docs/backup-restore-runbook.md).
 * Usage: bun run src/scripts/backup.ts
 *
 * Config (env):
 *   BACKUP_DIR            snapshot directory (default: <db dir>/backups)
 *   BACKUP_KEEP_HOURLY    newest snapshots always kept   (default 48)
 *   BACKUP_KEEP_DAILY     newest per day kept beyond that (default 14)
 *   BACKUP_KEEP_WEEKLY    newest per ISO week kept beyond that (default 8)
 */

import { Database } from 'bun:sqlite';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  isImagesSyncDue,
  parseSnapshotDate,
  selectSnapshotsToDelete,
  snapshotFilename,
} from '../lib/backup';

interface SnapshotInfo {
  name: string;
  path: string;
  date: Date;
}

const DB_PATH = resolve(process.env.DATABASE_URL || './data/pacsviewer.db');
const BACKUP_DIR = resolve(
  process.env.BACKUP_DIR || join(dirname(DB_PATH), 'backups'),
);
const IMAGES_DIR = join(dirname(DB_PATH), 'images');
const IMAGES_SYNC_MARKER = join(BACKUP_DIR, '.images-sync-last');
const LOG_FILE = join(BACKUP_DIR, 'backup.log');

const RETENTION = {
  hourly: intEnv('BACKUP_KEEP_HOURLY', 48),
  daily: intEnv('BACKUP_KEEP_DAILY', 14),
  weekly: intEnv('BACKUP_KEEP_WEEKLY', 8),
};

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── Audit hook (1.0: log-based record of backup success/failure) ─────────────

function audit(event: string, detail: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...detail });
  console.log(`[backup] ${line}`);
  try {
    const fd = openSync(LOG_FILE, 'a');
    writeSync(fd, line + '\n');
    closeSync(fd);
  } catch (err) {
    console.error(`[backup] failed to append ${LOG_FILE}:`, err);
  }
}

// ── Snapshot helpers ─────────────────────────────────────────────────────────

const SNAPSHOT_NAME_RE =
  /^pacsviewer-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/;

/** Existing snapshots in BACKUP_DIR matching our naming scheme. */
function listSnapshots(): SnapshotInfo[] {
  if (!existsSync(BACKUP_DIR)) return [];
  const snapshots: SnapshotInfo[] = [];
  for (const name of readdirSync(BACKUP_DIR)) {
    // Only consider files matching our exact naming scheme; seed.ts writes a
    // different pattern into the same directory and must not be touched.
    if (!SNAPSHOT_NAME_RE.test(name)) continue;
    const date = parseSnapshotDate(name);
    if (!date || Number.isNaN(date.getTime())) continue;
    snapshots.push({ name, path: join(BACKUP_DIR, name), date });
  }
  return snapshots;
}

/** Run VACUUM INTO; delete the partial target on failure. */
function vacuumInto(source: Database, targetPath: string): void {
  try {
    source.run('VACUUM INTO $path', { $path: targetPath });
  } catch (err) {
    // The target "must not previously exist"; a failed attempt can leave a
    // partial file behind — remove it so the next run isn't blocked.
    try {
      if (existsSync(targetPath)) unlinkSync(targetPath);
    } catch (cleanupErr) {
      console.error(`[backup] failed to remove partial snapshot:`, cleanupErr);
    }
    throw err;
  }
}

/** Sanity-check the fresh snapshot before advertising it as a backup. */
function verifySnapshot(path: string): string {
  const check = new Database(path, { readonly: true });
  try {
    const row = check.query<{ c: string }>('PRAGMA quick_check').get();
    const result = row?.c ?? 'unknown';
    if (result !== 'ok') throw new Error(`quick_check failed: ${result}`);
    return result;
  } finally {
    check.close();
  }
}

function pruneSnapshots(): number {
  const snapshots = listSnapshots();
  const toDelete = selectSnapshotsToDelete(snapshots, RETENTION);
  let pruned = 0;
  for (const name of toDelete) {
    try {
      unlinkSync(join(BACKUP_DIR, name));
      pruned++;
    } catch (err) {
      console.error(`[backup] failed to prune ${name}:`, err);
    }
  }
  return pruned;
}

// ── Image mirror (nightly rsync; images are immutable, written once) ────────

function imagesSyncDue(): boolean {
  if (!existsSync(IMAGES_SYNC_MARKER)) return true;
  const last = new Date(statSync(IMAGES_SYNC_MARKER).mtimeMs);
  return isImagesSyncDue(last, new Date());
}

function syncImages(): boolean {
  if (!existsSync(IMAGES_DIR)) {
    console.log('[backup] no data/images/ directory — skipping image sync');
    return false;
  }
  const dest = join(BACKUP_DIR, 'images-sync');
  mkdirSync(dest, { recursive: true });
  const started = Date.now();
  const proc = Bun.spawnSync(['rsync', '-a', '--delete', `${IMAGES_DIR}/`, `${dest}/`]);
  if (proc.exitCode !== 0) {
    throw new Error(
      `rsync exited ${proc.exitCode}: ${new TextDecoder().decode(proc.stderr).trim()}`,
    );
  }
  // touch the marker
  const now = new Date();
  const fd = openSync(IMAGES_SYNC_MARKER, 'w');
  writeSync(fd, now.toISOString());
  closeSync(fd);
  console.log(
    `[backup] images synced → ${dest} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): number {
  if (!existsSync(DB_PATH)) {
    audit('backup_failed', { reason: 'database_not_found', dbPath: DB_PATH });
    console.error(`[backup] database not found at ${DB_PATH}`);
    return 1;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });

  const targetName = snapshotFilename(new Date());
  const targetPath = join(BACKUP_DIR, targetName);

  const source = new Database(DB_PATH);
  try {
    vacuumInto(source, targetPath);
  } catch (err) {
    audit('backup_failed', { reason: 'vacuum_into_failed', error: String(err) });
    console.error('[backup] VACUUM INTO failed:', err);
    return 1;
  } finally {
    source.close();
  }

  try {
    verifySnapshot(targetPath);
  } catch (err) {
    audit('backup_failed', { reason: 'verify_failed', snapshot: targetName, error: String(err) });
    console.error('[backup] snapshot verification failed:', err);
    try {
      rmSync(targetPath, { force: true });
    } catch {/* best effort */}
    return 1;
  }

  const sizeBytes = statSync(targetPath).size;

  let prunedCount = 0;
  try {
    prunedCount = pruneSnapshots();
  } catch (err) {
    console.error('[backup] pruning failed:', err);
  }

  let imagesSynced = false;
  try {
    if (imagesSyncDue()) imagesSynced = syncImages();
  } catch (err) {
    audit('backup_images_sync_failed', { error: String(err) });
    console.error('[backup] image sync failed:', err);
  }

  audit('backup_success', {
    snapshot: targetName,
    sizeBytes,
    pruned: prunedCount,
    imagesSynced,
    backupDir: BACKUP_DIR,
  });
  console.log(
    `[backup] OK ${targetName} (${(sizeBytes / 1024 / 1024).toFixed(1)} MiB), pruned ${prunedCount}`,
  );
  return 0;
}

process.exit(main());
