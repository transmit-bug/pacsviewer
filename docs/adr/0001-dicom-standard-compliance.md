# ADR-0001: DICOM Standard Compliance for Study/Series Hierarchy

**Status:** Accepted  
**Date:** 2025-01-27  
**Deciders:** Domain model alignment session

## Context

The original PRD defined `Study` with both:
- `study_type: enum(oct, fundus, ffa, icga, vf, octa, other)`
- `modality: string`

This implied a Study has a fixed type, which conflicts with the DICOM standard where a Study is a container that can hold multiple Series of different modalities.

## Decision

**Follow DICOM standard hierarchy: Patient → Study → Series → Image**

1. Remove `study_type` from the `studies` table
2. Keep `modality` only on the `series` table
3. A Study's type is determined by the modalities of its child Series

## Rationale

### Clinical Workflow
- A patient visit may include multiple types of imaging (OCT + fundus + FFA)
- DICOM allows one Study to contain multiple Series of different modalities
- This is the standard practice in ophthalmology clinics

### DICOM Compliance
- DICOM Part 3 defines the Patient → Study → Series → Image hierarchy
- Study level has Study Description, but not a fixed "Study Type"
- Series level has Modality (0008,0060)

### Flexibility
- Supports both "one study per modality" and "one study with multiple modalities"
- Future-proof for multi-modal imaging workflows

## Consequences

### Positive
- Aligns with DICOM standard and industry practice
- Supports complex multi-modal examinations
- Simplifies data model (no redundant field)

### Negative
- Need to aggregate Series modalities to determine Study type
- Queries filtering by "study type" require JOIN with Series table

### Mitigations
- Create a view or computed field that aggregates Study modalities
- Index Series modality for efficient filtering

## Related

- PRD Module 3: Image Management System
- Schema: `apps/server/src/db/schema.ts`
