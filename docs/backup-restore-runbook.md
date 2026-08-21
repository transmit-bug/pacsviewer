# Backup & Restore Runbook (1.0 pilot)

Strategy per [`docs/research/sqlite-backup-for-1.0.md`](../docs/research/sqlite-backup-for-1.0.md):
scheduled **`VACUUM INTO`** snapshots of the SQLite database + a nightly mirror of
`data/images/`. `VACUUM INTO` is consistency-guaranteed by SQLite core on a live
database and requires no journal-mode changes.

## What is backed up

| What | Where | How |
|---|---|---|
| Database (`data/pacsviewer.db`) | `data/backups/pacsviewer-<ISO-timestamp>.db` | `VACUUM INTO` via `apps/server/src/scripts/backup.ts` |
| Image files (`data/images/`) | `data/backups/images-sync/` | nightly `rsync -a --delete` inside the same job |

Snapshots land in the same directory the seed script already uses for its
pre-reset copies; only files matching the exact `pacsviewer-<timestamp>.db`
naming scheme are pruned, so seed backups are never touched.

## Schedule

The job runs as a **host cron line** (the DB lives on the host filesystem via
the Compose bind mount `./data:/app/data`, so no container scheduling needed):

```cron
# hourly DB snapshot + retention prune (+ nightly image mirror)
0 * * * * cd /path/to/pacsviewer/apps/server && /usr/local/bin bun run src/scripts/backup.ts >> data/backups/cron.log 2>&1
```

(Adjust the bun path: `which bun`. A systemd timer may replace cron on
systemd hosts.)

Manual run: `cd apps/server && bun run src/scripts/backup.ts`

### Retention

Grandfather-father-son pruning in the same job:

- newest **48** snapshots always kept (hourly tier)
- newest snapshot per day kept for the first **14** days
- newest snapshot per ISO week kept for the first **8** weeks

Tunable via env (`BACKUP_KEEP_HOURLY`, `BACKUP_KEEP_DAILY`,
`BACKUP_KEEP_WEEKLY`, `BACKUP_DIR` — see `.env.example`).

### Monitoring / audit trail

Each run appends a JSON line (`backup_success` / `backup_failed`, with
snapshot name, size, prune count) to `data/backups/backup.log` and stdout.
Check the last entries after any alert or when verifying cron works:

```bash
tail -5 data/backups/backup.log
```

## Restore procedure

Prerequisite: snapshots exist at `data/backups/pacsviewer-*.db`.

Automated (recommended):

```bash
# 1. Stop the backend
docker compose stop server

# 2. Preview what will happen (dry run)
cd apps/server && bun run src/scripts/restore.ts latest        # or a specific snapshot path

# 3. Execute: quarantines current DB, copies snapshot, validates integrity_check,
#    prints smoke-test counts
bun run src/scripts/restore.ts latest --yes

# 4. Restore image files if needed
rsync -a ../data/backups/images-sync/ ../data/images/

# 5. Restart
docker compose start server
```

The script refuses to run while a hot `-journal` exists (server still writing);
stop the server first. The pre-restore DB is quarantined to
`data/backups/pacsviewer-pre-restore-<epoch>.db` — never deleted in place.

Manual equivalent (same steps):

```bash
docker compose stop server
mv data/pacsviewer.db data/backups/pacsviewer-pre-restore-$(date +%s).db
mv data/pacsviewer.db-journal data/backups/ 2>/dev/null   # if present
cp data/backups/<snapshot>.db data/pacsviewer.db
chmod 644 data/pacsviewer.db
rsync -a data/backups/images-sync/ data/images/
docker compose run --rm server bun -e 'const {Database}=require("bun:sqlite");const db=new Database("/app/data/pacsviewer.db");console.log(db.query("PRAGMA integrity_check").get(), db.query("SELECT count(*) c FROM patients").get())'
docker compose start server
```

Smoke test after restart: log in and open one recent study.

## Offsite copy (manual operator step)

Backups live on the same physical disk as the live database — this protects
against corruption and bad deletes, **not disk loss**. Copy the latest
snapshot off the machine periodically (hospital governance permitting):

```bash
rsync -a data/backups/ /mnt/external-drive/pacsviewer-offsite/
```

Recommended cadence: daily or after each import session.

## Post-1.0 upgrade path

If the ≤1 h RPO becomes insufficient, the planned upgrade is WAL mode +
[Litestream](https://litestream.io/) replication (rejected for 1.0 only due to
journal-mode change + second daemon). See research doc §4.
