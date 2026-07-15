# ADR-0005: Report Version Snapshots (Audit Only)

**Status:** Accepted  
**Date:** 2025-01-27  
**Deciders:** Domain model alignment session

## Context

The PRD defines a `ReportVersion` table for tracking report changes. The question was whether to create versions on every save or only on status transitions.

## Decision

**Create ReportVersion snapshots only on status transitions** (e.g., draft → pending_review, reviewed → published).

## Rationale

### Storage Efficiency
- Reports may be saved dozens of times during editing
- Full version history on every save would consume significant storage
- Most intermediate saves are not meaningful for audit purposes

### Audit Requirements
- The key audit need is "what was submitted for review" and "what was approved"
- Status transitions represent the meaningful checkpoints
- Enables rollback to the last approved version if needed

### Development Simplicity
- Simpler than full version control system
- Clear trigger points for snapshot creation
- Easier to implement and maintain

## Consequences

### Positive
- Efficient storage usage
- Clear audit trail at decision points
- Simple implementation

### Negative
- Cannot track every intermediate change
- Cannot rollback to arbitrary points in time

### Mitigations
- If full versioning is needed later, can add a `save_count` trigger
- Can add "explicit save as version" feature for important intermediate states

## Related

- Schema: `report_versions` table (to be added)
- PRD Module 7: Report System
