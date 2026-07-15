# ADR-0003: Two-Level Annotations (Image and Study)

**Status:** Accepted  
**Date:** 2025-01-27  
**Deciders:** Domain model alignment session

## Context

The original schema only allowed annotations to belong to Images. However, in clinical practice, physicians often make findings at the Study level (e.g., "macular hole detected") rather than on specific image slices.

## Decision

**Support annotations at both Image and Study levels.**

- `annotations.image_id` — nullable, references an Image
- `annotations.study_id` — nullable, references a Study
- One of the two must be non-null

## Rationale

### Clinical Workflow
- Physicians browse an entire OCT scan, then note findings
- Some findings are general to the examination, not specific to one slice
- Reports often reference study-level conclusions

### Flexibility
- Supports both specific (image-level) and general (study-level) annotations
- Enables better report integration
- Allows AI results to be attached at either level

## Consequences

### Positive
- More accurate representation of clinical workflow
- Better integration with report system
- Supports AI analysis at study level

### Negative
- Slightly more complex schema
- Need to handle nullable foreign keys
- Queries need to consider both levels

### Mitigations
- Database constraint ensures at least one of image_id or study_id is non-null
- Create indexes on both foreign keys for efficient queries

## Related

- Schema: `annotations` table
- PRD Module 5: Professional Image Editing
