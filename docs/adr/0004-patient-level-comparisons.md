# ADR-0004: Patient-Level Comparisons

**Status:** Accepted  
**Date:** 2025-01-27  
**Deciders:** Domain model alignment session

## Context

The `comparisons` table needs to support comparing images from different time points. The question was whether comparisons should belong to Patient or Study.

## Decision

**Comparisons belong to Patient, not Study.**

- `comparisons.patient_id` — references a Patient
- `comparisons.image_ids` — JSON array of Image IDs from potentially different Studies

## Rationale

### Clinical Workflow
- The most common comparison is cross-temporal: "Compare this OCT with the one from 3 months ago"
- This requires comparing images from different Studies
- Patient-level ownership enables this workflow

### Flexibility
- Supports both cross-study and within-study comparisons
- Enables longitudinal analysis of disease progression
- Allows comparing images from different modalities

## Consequences

### Positive
- Supports the most important clinical use case
- Enables disease progression tracking
- Flexible comparison configuration

### Negative
- Need to validate that all images belong to the same patient
- Slightly more complex query for study-specific comparisons

### Mitigations
- Application logic validates image ownership
- Can add study_id as optional field for study-specific comparisons if needed

## Related

- Schema: `comparisons` table
- PRD Module 6: Image Comparison System
