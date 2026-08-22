# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [1.0.0] - 2026-08-22

First stable release, scoped for a **single-machine hospital pilot** of the
ophthalmology PACS viewer. Deployment form: Docker Compose + SQLite behind a
Caddy TLS gateway (see `docs/deployment-guide.md`). Scope decisions and
hardening specs were locked in the wayfinder map
([#135](https://github.com/transmit-bug/pacsviewer/issues/135)) and its
sub-issues.

### Added

- **Viewer** — multi-modal ophthalmic image viewing (fundus, OCT, FFA/ICGA,
  visual field): Cornerstone.js viewports with window/level from DICOM,
  cine playback for multi-frame series, cinematic workspace, calibration-aware
  scale bar, OCT B-scan navigation and thickness-map entry.
- **Annotation & measurement** — point/length/area/freehand tools with real
  unit calibration from PixelSpacing, action-level undo/redo snapshots,
  layer ABC model, image filters, export to CSV/DICOM SR-compatible metadata.
- **Reports** — template-driven report authoring (sanitized rich text),
  version history, review workflow with status transitions up to `published`,
  PDF-ready rendering.
- **Follow-up comparison** — cross-study longitudinal comparison workbench
  (side-by-side / overlay / slider modes).
- **Patients & studies** — patient management with pinyin search, study/series
  browser, tag-driven attribution for manual imports.
- **Manual import (#136)** — standard-format upload (JPEG/PNG/TIFF/BMP) plus
  DICOM upload with magic-byte validation; per-file 100 MB cap and 200-file
  batch cap enforced on both client and server; batch uploads skip failed
  files and report per-file results; UI banner when tags will auto-create
  patient/study records; no vendor-proprietary OCT parsing by design.
- **DICOM network (SCP side)** — C-ECHO / C-FIND / C-STORE SCP on a separate
  TCP port (`DICOM_PORT`, default 11112), DICOMweb QIDO/WADO endpoints.
- **Audit logging (#138, #118)** — append-only audit API (admin role only);
  two-layer event model (coarse middleware + fine-grained catalog in
  `audit-events.ts`); unauthenticated requests recorded with NULL `user_id`
  under an enforced FK constraint (fixes #118 — never a fake `'anonymous'`);
  login failures recorded with structured reasons and linked to rate limiting;
  dedicated lockout event on rate-limit trips; retention purge defaulting to
  6 months (`AUDIT_RETENTION_MONTHS`), run at startup and daily.
- **Backup & restore (#137)** — scheduled `VACUUM INTO` snapshots into
  `data/backups/` with grandfather-father-son pruning (hourly/daily/weekly
  tiers), daily rsync mirror of `data/images/`, integrity-checked one-command
  restore script; runbook at `docs/backup-restore-runbook.md`.
- **Security hardening (#139)** — Caddy gateway with self-signed TLS as the
  only host-exposed port (443); session policy of 30-minute idle sliding
  window + 12-hour absolute cap (refresh cannot reset the cap); local password
  policy (≥8 chars with letters and digits, no LDAP); login/refresh rate
  limiting (5 failures → 15-minute lock, env-tunable); production seed creates
  only roles + one admin account with a randomized or env-provided initial
  password and forced first-login change; demo login route and dev fallbacks
  absent in production builds; configuration moved to environment variables
  (see `.env.example`).
- **Quality gates (#141)** — Playwright E2E gate with fresh synthetic DB and
  scenarios S1–S7; CI workflows for lint (Biome), typecheck, unit tests, and
  E2E — all green is a blocking condition for tagging releases.
- **Pilot documentation kit** — deployment guide, backup/restore runbook,
  doctor-facing user manual.

### Fixed

- #118 — `audit_logs.user_id` previously wrote `'anonymous'`, violating the
  FK constraint; now nullable with NULL for unauthenticated events.
- Orphan refresh tokens rejected instead of crashing the session flow;
  orphan-session seeding uses temporary FK-off.
- Login-failure audit rows deduplicated (single writer).
- Report creation 500 when `studyId` missing; series description mapping;
  CSV export CRLF conformance (RFC 4180); follow-up workbench 401 on images;
  viewer route-transition flicker; seed guard against accidental data wipes.

### Out of scope (post-1.0 candidates)

- C-STORE SCP inbound routing polish (#62 direction), Modality Worklist (#63),
  IOL calculator (#66) — closed for 1.0.
- PostgreSQL deployment, Litestream/WAL-based replication, desktop packaging,
  LDAP/AD integration — revisit after the pilot.

[1.0.0]: https://github.com/transmit-bug/pacsviewer/releases/tag/v1.0.0
