# ADR-0001: Domain Alignment Decisions

**Status:** Accepted  
**Date:** 2025-01-27  
**Deciders:** Domain model alignment session

## Summary

This ADR consolidates all decisions from the domain model alignment session. Individual ADRs have been merged to avoid documentation bloat.

---

## Decision 1: DICOM Standard Compliance (Issue #12)

**Decision:** Remove `studyType` from `studies` table. Modality is determined by child Series.

**Rationale:**
- Follows DICOM hierarchy: Patient → Study → Series → Image
- Study is a container; modality is on Series
- Supports multi-modal examinations (OCT + fundus in one visit)

**Consequences:**
- ✅ DICOM compliant, flexible for multi-modal workflows
- ❌ Need to aggregate Series modalities for Study type queries

---

## Decision 2: Two-Level Annotations (Issue #13)

**Decision:** Support annotations at both Image and Study levels.

**Rationale:**
- Physicians make findings at both levels
- Study-level: "macular hole detected"
- Image-level: specific finding on a slice

**Consequences:**
- ✅ Better represents clinical workflow
- ❌ Nullable foreign keys, slightly more complex queries

---

## Decision 3: Denormalized Patient ID on Reports (Issue #14)

**Decision:** Keep redundant `patientId` on `reports` table.

**Rationale:**
- Reports frequently need patient information
- Avoids JOIN with studies table for every query
- Patient-Report relationship is immutable

**Consequences:**
- ✅ Faster report queries
- ❌ Slightly more storage (one UUID per report)

---

## Decision 4: Report Version Snapshots (Issue #14)

**Decision:** Create ReportVersion only on status transitions.

**Rationale:**
- Storage efficiency (not every save)
- Audit requirements met (key decision points)
- Simpler than full version control

**Consequences:**
- ✅ Efficient storage, clear audit trail
- ❌ Cannot rollback to arbitrary points

---

## Decision 5: Patient-Level Comparisons

**Decision:** Comparisons belong to Patient, not Study.

**Rationale:**
- Enables cross-temporal comparison (most common use case)
- "Compare OCT from 3 months ago vs today"

**Consequences:**
- ✅ Supports longitudinal disease tracking
- ❌ Need to validate image ownership

---

## Decision 6: Device and Transfer Tracking (Issue #15)

**Decision:** Add Device and InboundTransfer tables.

**Rationale:**
- Track physical devices separately from adapters
- Monitor image transfer progress and errors
- Support retry mechanism for failed transfers

**Consequences:**
- ✅ Production-ready device integration
- ❌ Additional schema complexity

---

## Decision 7: Deferred Features

**Decision:** Defer system management tables and FilterPreset.

**Deferred:**
- SystemSetting, BackupJob, SystemAlert → Phase 5
- FilterPreset → Phase 2

**Rationale:**
- Independent modules, don't affect core functionality
- Requirements may change during development

---

## Related Issues

- #12: DICOM 标准对齐：Study/Series 层级重构
- #13: 标注系统升级：支持 Study 级别标注
- #14: 报告系统增强：版本快照 + 审核工作流
- #15: 设备接入框架：Device + 传输追踪
