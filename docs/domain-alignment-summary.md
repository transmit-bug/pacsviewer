# Domain Model Alignment Summary

**Date:** 2025-01-27  
**Session:** Domain model alignment with DICOM standards and best practices

---

## Decisions Made

### 1. DICOM Standard Compliance (ADR-0001)
**Decision:** Remove `studyType` from `studies` table. Modality is determined by child Series.

**Changes:**
- Removed `studyType` enum field from `studies` table
- Study type is now inferred from its Series modalities
- Follows DICOM hierarchy: Patient → Study → Series → Image

### 2. Denormalized Patient ID on Reports (ADR-0002)
**Decision:** Keep redundant `patientId` on `reports` table for query performance.

**Rationale:** Reports frequently need patient information; avoids JOIN with studies table.

### 3. Two-Level Annotations (ADR-0003)
**Decision:** Support annotations at both Image and Study levels.

**Changes:**
- Made `imageId` nullable in `annotations` table
- Added `studyId` field to `annotations` table
- Added constraint: at least one of `imageId` or `studyId` must be non-null

### 4. Patient-Level Comparisons (ADR-0004)
**Decision:** Comparisons belong to Patient, not Study.

**Rationale:** Enables cross-temporal comparison (e.g., OCT from 3 months ago vs today).

### 5. Report Version Snapshots (ADR-0005)
**Decision:** Create ReportVersion only on status transitions, not on every save.

**Changes:**
- Added `reportVersions` table
- Snapshots created at: draft → pending_review, reviewed → published

### 6. Device and Transfer Tracking
**Decision:** Add Device and InboundTransfer tables for production device integration.

**Changes:**
- Added `devices` table (physical imaging devices)
- Added `inboundTransfers` table (tracks image batches from devices)
- Updated `deviceAdapters` relations

### 7. Deferred Features
**Decision:** Defer system management tables and FilterPreset to later phases.

**Deferred:**
- SystemSetting, BackupJob, SystemAlert (Phase 5)
- FilterPreset (Phase 2)

---

## Schema Changes

### Tables Added
1. `devices` - Physical imaging devices
2. `inbound_transfers` - Image transfer tracking
3. `report_versions` - Report audit snapshots

### Tables Modified
1. `studies` - Removed `studyType` field
2. `annotations` - Added `studyId`, made `imageId` nullable

### Tables Unchanged
- `users`, `roles`, `sessions` - No changes needed
- `patients`, `patient_tags` - No changes needed
- `series`, `images` - No changes needed
- `layers` - No changes needed
- `reports` - Kept redundant `patientId`
- `report_templates` - No changes needed
- `comparisons` - Already at Patient level
- `device_adapters` - No changes needed
- `audit_logs` - No changes needed

---

## Files Created/Modified

### New Files
- `CONTEXT.md` - Domain glossary
- `docs/adr/0001-dicom-standard-compliance.md`
- `docs/adr/0002-denormalized-patient-id-on-reports.md`
- `docs/adr/0003-two-level-annotations.md`
- `docs/adr/0004-patient-level-comparisons.md`
- `docs/adr/0005-report-version-snapshots.md`

### Modified Files
- `apps/server/src/db/schema.ts` - Updated schema
- `AGENTS.md` - Updated entity relationships

---

## Next Steps

1. **Database Migration**
   ```bash
   cd apps/server
   bun run db:generate
   bun run db:push
   ```

2. **Update Seed Data**
   - Update seed.ts to reflect new schema
   - Add sample devices and transfers

3. **Update API Routes**
   - Add routes for devices, transfers, report versions
   - Update annotation routes for study-level support

4. **Update Frontend**
   - Update types in `@pacsviewer/shared`
   - Update API services
   - Update UI components for new features

---

## Domain Model Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         PACS Viewer Domain Model                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐             │
│  │ Patient  │──────│  Study   │──────│  Series  │             │
│  └──────────┘      └──────────┘      └──────────┘             │
│       │                  │                  │                   │
│       │                  │                  ▼                   │
│       │                  │            ┌──────────┐             │
│       │                  │            │  Image   │             │
│       │                  │            └──────────┘             │
│       │                  │                  │                   │
│       │                  ▼                  ▼                   │
│       │            ┌──────────┐      ┌──────────┐             │
│       │            │  Report  │      │Annotation│             │
│       │            └──────────┘      └──────────┘             │
│       │                  │                                     │
│       │                  ▼                                     │
│       │            ┌──────────┐                                │
│       │            │  Version │                                │
│       │            └──────────┘                                │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────┐                                                  │
│  │Comparison│                                                  │
│  └──────────┘                                                  │
│                                                                 │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐             │
│  │  Device  │──────│ Adapter  │──────│ Transfer │             │
│  └──────────┘      └──────────┘      └──────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
