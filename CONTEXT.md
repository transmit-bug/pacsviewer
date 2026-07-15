# PACS Viewer — Domain Glossary

A shared vocabulary for the ophthalmic imaging management system. All team members and AI agents should use these terms consistently.

---

## Core Entities

### Patient (患者)
A person receiving ophthalmic care. Identified by MRN (病历号). Contains demographic and contact information.

- **MRN** — Medical Record Number, unique patient identifier
- **Tags** — Categorical labels (e.g., "diabetes", "glaucoma") for filtering and grouping

### Study (检查)
A single examination visit. Corresponds to one patient visit to the clinic. May contain multiple Series of different modalities.

- Follows DICOM hierarchy: Patient → Study → Series → Image
- Does NOT have a fixed modality — modality is determined by its child Series
- Has a status workflow: pending → in_progress → diagnosed → reported

### Series (序列)
A sequence of images within a Study, sharing the same modality and acquisition parameters.

- Each Series has a **modality** (e.g., OCT, fundus photo, FFA)
- Contains one or more Images
- Represents a single acquisition run (e.g., one OCT volume scan)

### Image (图像)
A single image file. Can be DICOM or common formats (JPEG, PNG, TIFF, BMP).

- Belongs to exactly one Series
- Contains metadata (DICOM tags or EXIF)
- Has a file hash (SHA-256) for deduplication

---

## Clinical Workflow

### Report (报告)
A clinical document summarizing findings from a Study. Created by a physician, reviewed by a senior physician.

- Belongs to one Study (and implicitly to one Patient)
- Has a template that defines its structure
- Status workflow: draft → pending_review → reviewed → published
- **Patient ID is stored redundantly** for query performance (denormalized)

### ReportTemplate (报告模板)
A reusable structure for creating Reports. Defines fields, layout, and formatting.

- Types: OCT, fundus, FFA, ICGA, VF, comprehensive, custom
- System templates are read-only; users can create custom templates

### ReportVersion (报告版本)
A snapshot of a Report at a status transition point (e.g., when submitted for review).

- Only created on status changes, not on every save
- Enables audit trail and rollback capability

---

## Image Analysis

### Annotation (标注)
A markup or measurement on an image or study. Can belong to either an Image or a Study.

- **Image-level annotations**: Specific findings on a particular image slice
- **Study-level annotations**: General findings for the entire examination (e.g., "macular hole detected")
- Types: measurement, arrow, text, freehand, ROI, highlight

### Layer (图层)
A visual layer for organizing annotations and AI results on an image.

- Types: image (base), annotation (user markup), ai_result (AI output)
- Controls visibility, opacity, locking, and z-order

### Comparison (对比)
A side-by-side or overlay view of images, typically for comparing the same patient's images across different time points.

- Belongs to a Patient (not a Study) — enables cross-study comparison
- Types: side_by_side, overlay, slider
- Contains a list of image IDs and display configuration

---

## Device Integration

### DeviceAdapter (设备适配器)
A software component that handles communication with external devices using a specific protocol.

- Types: DICOM, REST, file, custom
- Manages connection lifecycle (start/stop/status)
- One adapter can serve multiple devices

### Device (设备)
A physical imaging device (e.g., Zeiss OCT, Heidelberg Spectralis).

- Belongs to one DeviceAdapter
- Tracks device status, manufacturer, model, serial number
- Records last sync time and image count

### InboundTransfer (传入传输)
A record of images received from a device in a single batch.

- Tracks progress: file_count, processed_count, error_count
- Status: pending → processing → completed → failed
- Enables retry of failed transfers

---

## Relationships

```
Patient ──┬── Study ──┬── Series ── Image ──┬── Annotation (image-level)
          │           │                     └── Layer
          │           ├── Report ── ReportVersion
          │           └── Annotation (study-level)
          │
          └── Comparison (cross-study)

Device ── DeviceAdapter
          └── InboundTransfer
```

---

## Key Design Decisions

1. **DICOM Standard Compliance** — Study does not have a fixed modality; modality is on Series. See [ADR-0001](docs/adr/0001-dicom-standard-compliance.md).

2. **Denormalized Patient ID on Reports** — `reports.patient_id` is redundant (derivable via `studies.patient_id`) but kept for query performance.

3. **Two-level Annotations** — Annotations can belong to either Image or Study level to support both specific findings and general conclusions.

4. **Patient-level Comparisons** — Comparisons belong to Patient, not Study, to enable cross-temporal image comparison.

5. **Audit Snapshots** — Report versions are only created at status transitions, not on every save.
