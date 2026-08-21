# Research: Online Backup & Restore for Single-Machine SQLite (1.0 Hospital Pilot)

- **Ticket**: [research: 单机 SQLite 在线备份与恢复方案选型 (#137)](https://github.com/transmit-bug/pacsviewer/issues/137), part of the [wayfinder map: 1.0 医院试点发布 (#135)](https://github.com/transmit-bug/pacsviewer/issues/135)
- **Scope**: decision only — no implementation in this ticket.
- **Date**: 2026-08-21

## 1. Ground truth from this repo

| Fact | Evidence |
|---|---|
| DB driver is `bun:sqlite` (Bun's built-in SQLite3), opened via `new Database(process.env.DATABASE_URL \|\| './data/pacsviewer.db')` | `apps/server/src/db/index.ts` |
| **No journal mode is set anywhere** — a fresh DB runs in default rollback-journal (`delete`) mode. Verified locally on Bun 1.4.0: `PRAGMA journal_mode` → `"delete"`, and only `pacsviewer.db` exists (no `-wal`/`-shm` sidecars) | `apps/server/src/db/index.ts`; local check; SQLite docs confirm connections default to `journal_mode=DELETE` ([wal.html §3](https://www.sqlite.org/wal.html#activating)) |
| `bun:sqlite` exposes **no `.backup()` method** (prototype: `run, prepare, query, transaction, exec, serialize, fileControl, …`). The C backup API is not reachable without native bindings | Local check on Bun 1.4.0; [bun:sqlite docs](https://bun.com/docs/api/sqlite) list no backup method |
| Docker Compose bind-mounts `./data:/app/data`, with `DATABASE_URL=/app/data/pacsviewer.db`. The DB therefore lives on the host filesystem at `<repo>/data/`, not inside a named volume | [`docker-compose.yml`](../../docker-compose.yml) |
| Images are stored as files under `data/images/` (`filePath`, `fileHash` columns); only metadata is in SQLite. A complete backup must cover **both** the DB and `data/images/` | `apps/server/src/db/schema.ts` (images table); `apps/server/src/routes/images.ts` ("write file + thumbnail under data/images") |
| `db/seed.ts` already snapshots the DB to `data/backups/` before a reset, copying `db`, `-wal`, `-shm` files | `apps/server/src/db/seed.ts` (`backupDatabase()`) |

## 2. What the primary sources say

### 2.1 Copying a live database file is unsafe by default

SQLite's own corruption guide: a background copy taken "while it is in the middle of a transaction … might contain some old and some new content, and thus be corrupt." It lists exactly three safe live-copy approaches: `sqlite3_rsync`, **`VACUUM INTO`**, and the **backup API** — all of which "will work even on a live database." A raw file copy is only safe if no transactions are in progress, and if a prior write failed, the `-journal`/`-wal` sidecar must be copied together with the DB. ([howtocorrupt.html §1.2](https://www.sqlite.org/howtocorrupt.html#backup_while_transaction_active))

Related hazard: "Copying a database file without also copying its journal" is explicitly listed as likely corruption ([howtocorrupt.html §1.4](https://www.sqlite.org/howtocorrupt.html#hotjournal)). In our default rollback-journal mode there is always a window where a hot `-journal` exists during writes.

### 2.2 `VACUUM INTO`

- Creates a new file containing "the same logical content as the original database, fully vacuumed"; the original is unchanged. It is an official "alternative to the backup API for generating backup copies of a live database". Bonus for patient data: "all deleted content is purged from the backup, leaving behind no forensic traces." ([lang_vacuum.html §2.1](https://www.sqlite.org/lang_vacuum.html#vacuuminto))
- The target file "must not previously exist, or else it must be an empty file, or the VACUUM INTO command will fail" — so use timestamped filenames. ([lang_vacuum.html §2.1](https://www.sqlite.org/lang_vacuum.html#vacuuminto))
- It is plain SQL, so it works through Drizzle/`bun:sqlite` (`db.run("VACUUM INTO ...")`) even though `bun:sqlite` lacks a `.backup()` binding. It works regardless of journal mode (WAL not required).
- Caveat: VACUUM fails if the *same connection* has an open transaction; `VACUUM INTO` is read-only against the source so it does not block writers the way plain `VACUUM` does. ([lang_vacuum.html §3](https://www.sqlite.org/lang_vacuum.html#howvacuumworks))

### 2.3 Online Backup API

The backup API copies incrementally, locking the source "only for the brief periods of time when it is actually being read", letting other users continue ([backup.html §1](https://www.sqlite.org/backup.html)). But it is a **C interface**; `bun:sqlite` does not expose it (see §1). Node's `node:sqlite` has `backup()`, Bun does not. Using it would require adding `better-sqlite3` as a runtime dependency just for backups — extra weight for no gain over `VACUUM INTO` at pilot scale (the API's advantages are fewer CPU cycles and incremental progress for very large DBs; our DB is metadata-only, images are on disk).

### 2.4 WAL mode & Litestream

- WAL mode is off by default and must be enabled per-database; once set it is persistent across restarts ([wal.html §3, §3.3](https://www.sqlite.org/wal.html#persistence_of_wal_mode)).
- Litestream runs as a separate background process that "continuously copies write-ahead log pages … to a replica", effectively taking over checkpointing: "It starts a long-running read transaction to prevent any other process from checkpointing" and packages new WAL pages into LTX files ([litestream.io/how-it-works](https://litestream.io/how-it-works/)). Restore is `litestream restore -o db2 s3://bucket/db` ([getting-started](https://litestream.io/getting-started/#restoring-your-database)).
- Consequences for us:
  1. **Litestream requires WAL mode.** Our DB is in `delete` mode; adopting Litestream means changing the app's journal mode (a runtime-behavior change touching every read/write path) — out of proportion for a stability-focused pilot release.
  2. It adds a second long-running process (sidecar container in Compose, per the [official Docker guide](https://litestream.io/guides/docker/)), plus replica credentials/monitoring.
  3. Replicating patient data to S3 raises hospital data-governance questions; a local-disk replica protects against corruption but not disk loss (same machine).

### 2.5 Filesystem / volume snapshots while running

- Non-atomic tools (`cp`, `rsync`) over a live DB hit exactly the §2.1 hazards: torn copies and mispaired journals. With our rollback-journal mode there is no way to make a plain file copy consistent without stopping writes.
- Atomic block-level snapshots (LVM/ZFS/btrfs) are crash-consistent and SQLite recovers from them like from power loss — but they depend on host filesystem features we cannot assume at the pilot site, and Docker Compose here uses a plain bind mount ([docker-compose.yml](../../docker-compose.yml)). Not portable → rejected as the primary mechanism.

### 2.6 App-level admin export endpoint

An authenticated endpoint running `VACUUM INTO` server-side gives operators an on-demand snapshot without host shell access. Useful complement, but as the *primary* strategy it expands the auth surface (a new privileged route handling patient data) and still needs a scheduler for unattended backups. Better folded into the same mechanism as option (a).

## 3. Option comparison

| Criterion | (a) Scheduled `VACUUM INTO` | (b) Litestream | (c) FS/volume snapshots | (d) Admin export endpoint |
|---|---|---|---|---|
| Consistency on live DB | Guaranteed by SQLite core ([§2.2]) | Guaranteed (WAL-based) | Unsafe unless atomic block snapshot ([§2.5]) | Same as (a) |
| Works with current journal mode (`delete`) | Yes | No — requires enabling WAL first ([§2.4]) | N/A | Yes |
| Code changes required | None (plain SQL; can be run via one-shot container or later wired into the app) | Journal-mode change + sidecar service + config + credentials | None, but infra-dependent | New route + authz |
| RPO | Backup interval (e.g., hourly ⇒ ≤1 h loss) | Seconds | Snapshot interval | On demand |
| Restore procedure | Stop server → replace file → start. One file, no tooling | `litestream restore` + replay; requires replica store access | Restore volume snapshot; tooling varies by FS | Same as (a) |
| Operational burden (single machine, pilot) | Low: one cron/systemd timer + retention cleanup | Medium-high: second daemon, monitoring, S3/local replica lifecycle | Site-dependent, fragile | Low, but manual |
| Fits Docker Compose setup | Yes — `./data` is a host bind mount; timer runs on host or as a one-shot compose service writing into `./data/backups/` | Yes but adds a service to compose | Bind mount bypasses named-volume snapshot tooling | Yes |
| Covers image files too? | No (DB only) — pair with `rsync`/`tar` of `data/images/` | No — pair likewise | Yes (whole directory) | No |

Note on RPO: the pilot ingests images by manual import only (per [#135](https://github.com/transmit-bug/pacsviewer/issues/135)), so write volume is low and bursty around import sessions. An hourly schedule bounds worst-case loss to roughly one hour of imports, which is acceptable for a pilot given the alternative's added moving parts. Image files are written once and never mutated (file-hash verified), so a nightly `rsync -a --link-dest` style sync of `data/images/` composes cleanly with DB snapshots.

## 4. Recommendation

**Adopt scheduled `VACUUM INTO` (option a) as the 1.0 backup strategy**, executed as a host cron/systemd timer (or one-shot Compose service) against the `./data` bind mount, storing timestamped snapshots in `data/backups/` alongside the existing seed-backup convention, paired with a nightly rsync of `data/images/`. Revisit Litestream/WAL replication post-1.0 if the RPO becomes insufficient — it remains the right upgrade path and is deliberately not ruled out.

Rationale in one line: it is the only option that is consistency-guaranteed by SQLite core on a live database, requires zero changes to the app or its journal mode, has a one-file restore procedure a hospital IT generalist can follow, and fits the existing bind-mount layout — exactly matching #135's "only what the pilot genuinely needs" bar.

### Concrete restore steps (to be documented in the pilot doc kit)

Prerequisite: backups exist at `data/backups/pacsviewer-YYYYMMDDTHHMMSS.db` (+ `images-sync/` mirror).

1. Stop the backend: `docker compose stop server`.
2. Quarantine the current DB (never delete in place):
   `mv data/pacsviewer.db data/backups/pacsviewer-pre-restore-$(date +%s).db`
   (also move any stray `data/pacsviewer.db-journal` if present).
3. Restore the chosen snapshot:
   `cp data/backups/<snapshot>.db data/pacsviewer.db && chmod 644 data/pacsviewer.db`
4. Restore image files if needed:
   `rsync -a data/backups/images-sync/ data/images/`
5. Validate before reopening traffic:
   `docker compose run --rm server bun -e 'const {Database}=require("bun:sqlite");const db=new Database("/app/data/pacsviewer.db");console.log(db.query("PRAGMA integrity_check").get(), db.query("SELECT count(*) c FROM patients").get())'`
6. Restart: `docker compose start server`; smoke-test login + open one recent study.

### Implementation notes (for the future build ticket — not done here)

- Target filename must not pre-exist ([§2.2]); generate `pacsviewer-<ISO-timestamp>.db` and delete failed partials.
- Retention: keep e.g. 48 hourly + 14 daily + 8 weekly snapshots; prune in the same timer job.
- Backups land on the same physical disk as the live DB — acceptable for the pilot, but the doc kit should add "copy latest snapshot to external/offsite media" as a manual operator step (hospital governance permitting).
- An authenticated admin "export now" endpoint reusing the same `VACUUM INTO` path is a natural follow-up, tracked separately.

## Sources

- https://www.sqlite.org/howtocorrupt.html (§1.2 safe live-copy approaches; §1.4 hot-journal hazards)
- https://www.sqlite.org/lang_vacuum.html (§2.1 VACUUM INTO semantics; §3 how VACUUM works)
- https://www.sqlite.org/backup.html (Online Backup API; §1.1 other techniques)
- https://www.sqlite.org/wal.html (§3 activation/default DELETE mode; §3.3 persistence)
- https://litestream.io/how-it-works/ (WAL page streaming, checkpoint takeover)
- https://litestream.io/getting-started/ (replicate/restore workflow)
- https://litestream.io/guides/docker/ (sidecar/same-container deployment)
- https://bun.com/docs/api/sqlite (bun:sqlite surface; WAL sidecar behavior)
- Repo: `apps/server/src/db/index.ts`, `apps/server/src/db/schema.ts`, `apps/server/src/routes/images.ts`, `apps/server/src/db/seed.ts`, `docker-compose.yml`, `.env.example`
