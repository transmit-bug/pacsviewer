import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_RETENTION,
  isoWeekKey,
  isImagesSyncDue,
  parseSnapshotDate,
  selectSnapshotsToDelete,
  snapshotFilename,
} from '../backup';

function at(iso: string): Date {
  return new Date(iso);
}

describe('snapshotFilename / parseSnapshotDate', () => {
  test('produces pacsviewer-<ISO-timestamp>.db with sanitized separators', () => {
    const name = snapshotFilename(at('2026-08-21T09:05:03.123Z'));
    expect(name).toBe('pacsviewer-2026-08-21T09-05-03-123Z.db');
    // VACUUM INTO requires the target not to pre-exist; ':' is illegal on
    // some filesystems and '.' in the middle breaks naive extension logic.
    expect(name).not.toMatch(/[:]/);
  });

  test('round-trips through parseSnapshotDate', () => {
    for (const iso of ['2026-08-21T09:05:03.123Z', '2026-01-01T00:00:00.000Z']) {
      const parsed = parseSnapshotDate(snapshotFilename(at(iso)));
      expect(parsed?.toISOString()).toBe(iso);
    }
  });

  test('returns null for foreign filenames (seed backups etc.)', () => {
    expect(parseSnapshotDate('pacsviewer.db-2026-08-21T09-05-03-123Z')).toBeNull();
    expect(parseSnapshotDate('pacsviewer-pre-restore-1724223000.db')).toBeNull();
    expect(parseSnapshotDate('random.db')).toBeNull();
  });
});

describe('isoWeekKey', () => {
  test('buckets dates by ISO week', () => {
    expect(isoWeekKey(at('2026-08-21T10:00:00Z'))).toBe(isoWeekKey(at('2026-08-17T01:00:00Z')));
    expect(isoWeekKey(at('2026-08-21T10:00:00Z'))).not.toBe(
      isoWeekKey(at('2026-08-24T10:00:00Z')),
    );
  });

  test('handles year boundaries (2026-01-01 belongs to 2026-W01)', () => {
    expect(isoWeekKey(at('2026-01-01T12:00:00Z'))).toBe('2026-W01');
    expect(isoWeekKey(at('2025-12-29T12:00:00Z'))).toBe('2026-W01'); // Mon of ISO week 1
  });
});

describe('selectSnapshotsToDelete', () => {
  function names(dates: string[]): { name: string; date: Date }[] {
    return dates.map((iso) => {
      const date = at(iso);
      return { name: snapshotFilename(date), date };
    });
  }

  test('keeps the newest `hourly` snapshots unconditionally', () => {
    const snaps = names([
      '2026-08-21T08:00:00Z',
      '2026-08-21T07:00:00Z',
      '2026-08-21T06:00:00Z',
      '2026-08-21T05:00:00Z',
    ]);
    const del = selectSnapshotsToDelete(snaps, { hourly: 3, daily: 0, weekly: 0 });
    expect(del.size).toBe(1);
    expect(del.has(snapshotFilename(at('2026-08-21T05:00:00Z')))).toBe(true);
  });

  test('keeps newest-per-day within the daily window even beyond hourly tier', () => {
    // 2 hourlies kept; older snapshots from previous days: keep newest per day.
    const snaps = names([
      '2026-08-21T08:00:00Z', // hourly tier
      '2026-08-21T07:00:00Z', // hourly tier
      '2026-08-20T23:00:00Z', // newest of Aug 20 → keep
      '2026-08-20T06:00:00Z', // same day as above → delete
      '2026-08-19T23:00:00Z', // newest of Aug 19 → keep (daily=14)
    ]);
    const del = selectSnapshotsToDelete(snaps, { hourly: 2, daily: 14, weekly: 0 });
    expect(del.has(snapshotFilename(at('2026-08-20T06:00:00Z')))).toBe(true);
    expect(del.has(snapshotFilename(at('2026-08-19T23:00:00Z')))).toBe(false);
    expect(del.size).toBe(1);
  });

  test('daily tier stops after N distinct days (newest per day kept)', () => {
    const snaps = [
      ...names(['2026-08-21T00:00:00Z']), // day 1 (also hourly)
      ...names(['2026-08-20T00:00:00Z', '2026-08-20T06:00:00Z']), // day 2
      ...names(['2026-08-19T00:00:00Z']), // day 3 — beyond daily=2
    ];
    const del = selectSnapshotsToDelete(snaps, { hourly: 1, daily: 2, weekly: 0 });
    // Day 3 is outside the daily window and weekly=0 → deleted.
    expect(del.has(snapshotFilename(at('2026-08-19T00:00:00Z')))).toBe(true);
    // Day 2 keeps only its newest snapshot.
    expect(del.has(snapshotFilename(at('2026-08-20T06:00:00Z')))).toBe(false);
    expect(del.has(snapshotFilename(at('2026-08-20T00:00:00Z')))).toBe(true);
    expect(del.size).toBe(2);
  });

  test('weekly tier rescues one snapshot per week beyond the daily window', () => {
    const snaps = names([
      '2026-08-21T00:00:00Z', // this week, hourly
      '2026-08-01T12:00:00Z', // newest of its week among the old ones → keep
      '2026-07-25T12:00:00Z', // previous week → keep
      '2026-07-24T12:00:00Z', // same week as above → delete
    ]);
    const del = selectSnapshotsToDelete(snaps, { hourly: 1, daily: 1, weekly: 8 });
    expect(del.has(snapshotFilename(at('2026-08-01T12:00:00Z')))).toBe(false);
    expect(del.has(snapshotFilename(at('2026-07-25T12:00:00Z')))).toBe(false);
    expect(del.has(snapshotFilename(at('2026-07-24T12:00:00Z')))).toBe(true);
  });

  test('weekly limit caps rescued weeks', () => {
    const snaps = names([
      '2026-08-21T00:00:00Z', // current
      '2026-08-01T12:00:00Z', // week -3
      '2026-07-25T12:00:00Z', // week -4
      '2026-07-18T12:00:00Z', // week -5 → beyond weekly=3
    ]);
    const del = selectSnapshotsToDelete(snaps, { hourly: 1, daily: 1, weekly: 3 });
    expect(del.has(snapshotFilename(at('2026-07-18T12:00:00Z')))).toBe(true);
    expect(del.has(snapshotFilename(at('2026-07-25T12:00:00Z')))).toBe(false);
  });

  test('handles empty input', () => {
    expect(selectSnapshotsToDelete([], DEFAULT_RETENTION).size).toBe(0);
  });
});

describe('isImagesSyncDue', () => {
  const now = at('2026-08-21T12:00:00Z');

  test('due when never synced', () => {
    expect(isImagesSyncDue(null, now)).toBe(true);
  });

  test('not due within the interval', () => {
    expect(isImagesSyncDue(at('2026-08-20T18:00:00Z'), now, 24)).toBe(false);
  });

  test('due after the interval elapsed', () => {
    expect(isImagesSyncDue(at('2026-08-20T11:59:00Z'), now, 24)).toBe(true);
  });
});

// ── Integration: real VACUUM INTO against a temp database ────────────────────

describe('VACUUM INTO integration', () => {
  test('creates a consistent copy and refuses an existing non-empty target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pacsviewer-backup-test-'));
    try {
      const srcPath = join(dir, 'source.db');
      const src = new Database(srcPath);
      src.run('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
      src.run("INSERT INTO t (v) VALUES ('hello')");
      src.close();

      // Same SQL path used by scripts/backup.ts (bound-parameter expression).
      const conn = new Database(srcPath);
      const target = join(dir, 'pacsviewer-2026-08-21T00-00-00-000Z.db');
      conn.run('VACUUM INTO ?', [target]);
      conn.close();

      expect(existsSync(target)).toBe(true);
      const copy = new Database(target, { readonly: true });
      const rows = copy.query('SELECT * FROM t').all() as { id: number; v: string }[];
      expect(rows).toEqual([{ id: 1, v: 'hello' }]);
      const quickCheck = copy.query('PRAGMA quick_check').get() as Record<string, string> | undefined;
      expect(quickCheck && Object.values(quickCheck)[0]).toBe('ok');
      copy.close();

      // Second run into the same target must fail (filename must not pre-exist).
      const conn2 = new Database(srcPath);
      expect(() => conn2.run('VACUUM INTO ?', [target])).toThrow();
      conn2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
