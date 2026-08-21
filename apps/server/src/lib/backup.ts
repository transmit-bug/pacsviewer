/**
 * Backup pure logic — shared by scripts/backup.ts and its unit tests.
 *
 * Strategy (see docs/research/sqlite-backup-for-1.0.md):
 *   scheduled `VACUUM INTO` snapshots into data/backups/, paired with a
 *   periodic rsync of data/images/. Snapshot filenames embed an ISO
 *   timestamp because VACUUM INTO fails if the target already exists.
 *
 * Retention policy (grandfather-father-son):
 *   keep ~48 hourly + 14 daily + 8 weekly snapshots, prune the rest.
 */

export interface BackupRetention {
  /** Newest snapshots always kept (the "hourly" tier). */
  hourly: number;
  /** Newest snapshot per day kept, beyond the hourly tier. */
  daily: number;
  /** Newest snapshot per ISO week kept, beyond the daily tier. */
  weekly: number;
}

/** Defaults from docs/research/sqlite-backup-for-1.0.md ("Implementation notes"). */
export const DEFAULT_RETENTION: BackupRetention = {
  hourly: 48,
  daily: 14,
  weekly: 8,
};

/**
 * Snapshot filename: pacsviewer-<ISO-timestamp>.db
 * ':' and '.' are sanitized to '-' (same convention as db/seed.ts) so the
 * names are filesystem-safe; parseSnapshotDate() reverses this.
 */
export function snapshotFilename(date: Date): string {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `pacsviewer-${stamp}.db`;
}

const SNAPSHOT_RE =
  /^pacsviewer-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.db$/;

/** Inverse of snapshotFilename(); returns null for non-snapshot names. */
export function parseSnapshotDate(name: string): Date | null {
  const m = SNAPSHOT_RE.exec(name);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO-8601 week key, e.g. "2026-W34". */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const weekday = t.getUTCDay() || 7; // Mon=1 .. Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - weekday); // jump to this week's Thursday
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Decide which snapshots to delete under the retention policy.
 *
 * Tiers are evaluated newest-first over all snapshots:
 *   1. hourly — the N most recent snapshots are always kept;
 *   2. daily  — the newest snapshot of each day is kept for the first N days;
 *   3. weekly — the newest snapshot of each ISO week is kept for the first N weeks.
 * Everything else is deleted.
 *
 * @param snapshots snapshot descriptors (name + timestamp)
 * @returns names that should be pruned
 */
export function selectSnapshotsToDelete(
  snapshots: ReadonlyArray<{ name: string; date: Date }>,
  retention: BackupRetention = DEFAULT_RETENTION,
): Set<string> {
  const sorted = [...snapshots].sort((a, b) => b.date.getTime() - a.date.getTime());

  const keep = new Set<string>();

  // Hourly tier: the N most recent snapshots are always kept.
  for (let i = 0; i < Math.min(retention.hourly, sorted.length); i++) {
    keep.add(sorted[i].name);
  }

  // Daily/weekly tiers: keep the newest snapshot of each successive distinct
  // bucket until the bucket count exceeds the tier limit.
  let tierCount = 0;
  let lastKey: string | null = null;

  const walkTier = (keyFn: (d: Date) => string, limit: number): void => {
    tierCount = 0;
    lastKey = null;
    for (const s of sorted) {
      const key = keyFn(s.date);
      if (key !== lastKey) {
        lastKey = key;
        tierCount++;
        if (tierCount > limit) break;
        keep.add(s.name);
      }
    }
  };

  walkTier(dayKey, retention.daily);
  walkTier(isoWeekKey, retention.weekly);

  return new Set(sorted.filter((s) => !keep.has(s.name)).map((s) => s.name));
}

/**
 * Whether the image-file mirror is due, given the last sync time.
 * Images are written once and never mutated, so a daily sync suffices
 * (research doc §3: "a nightly rsync … composes cleanly with DB snapshots").
 */
export function isImagesSyncDue(lastSync: Date | null, now: Date, intervalHours = 24): boolean {
  if (!lastSync) return true;
  return now.getTime() - lastSync.getTime() >= intervalHours * 3_600_000;
}
