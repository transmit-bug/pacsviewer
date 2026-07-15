# ADR-0002: Denormalized Patient ID on Reports

**Status:** Accepted  
**Date:** 2025-01-27  
**Deciders:** Domain model alignment session

## Context

The `reports` table has both `patient_id` and `study_id`. The `patient_id` is redundant because it can be derived through `study → patient` relationship.

## Decision

**Keep the redundant `patient_id` on the `reports` table.**

## Rationale

### Query Performance
- Report queries almost always need patient information
- Avoids JOIN with `studies` table for every report query
- Reduces query complexity for report listing and search

### Data Integrity
- Patient-Report relationship is immutable (a report never changes its patient)
- No risk of inconsistency in normal operations

### Development Simplicity
- Simpler queries for report-related features
- Easier to reason about report data

## Consequences

### Positive
- Faster report queries
- Simpler application code
- No additional JOINs needed

### Negative
- Slightly more storage (one UUID per report)
- Need to ensure consistency during data migration

### Mitigations
- Database constraints can enforce consistency
- Application logic ensures patient_id matches study's patient

## Related

- Schema: `reports` table
- PRD Module 7: Report System
