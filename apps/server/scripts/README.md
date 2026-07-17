# PACS Viewer Database Scripts

This directory contains scripts for database seeding and maintenance.

## Scripts

### `seed-hrf.ts` - Import Real Fundus Images

Downloads and imports real ophthalmic images from the HRF (High-Resolution Fundus) dataset.

**Dataset**: High-Resolution Fundus (HRF) Image Database  
**Source**: Friedrich-Alexander-Universität Erlangen-Nürnberg  
**License**: Free for research and educational use

**What it does**:
1. Downloads HRF dataset ZIP files (healthy, glaucoma, diabetic_retinopathy)
2. Extracts images to `data/datasets/hrf/`
3. Generates thumbnails
4. Creates Patient → Study → Series → Image records in database
5. Links to existing users (doctors) for physician assignment

**Usage**:
```bash
cd apps/server
bun run db:seed-hrf
```

**Output**:
- `data/datasets/hrf/` - Raw dataset files (can be deleted after import)
- `data/images/` - Processed image files with thumbnails

---

### `cleanup-full.ts` - Remove Redundant Files

Cleans up all redundant files after HRF import.

**Usage**:
```bash
cd apps/server
bun run db:cleanup
```

**What it does**:
1. Removes orphaned images from `data/images/` (not referenced in database)
2. Deletes HRF ZIP files from `data/datasets/hrf/`
3. Deletes HRF extracted directories from `data/datasets/hrf/`
4. Keeps only files referenced in database (HRF images + thumbnails)

---

## Recommended Workflow

1. **Initial Setup**:
   ```bash
   # Create database structure (users, patients, studies, series, templates, etc.)
   bun run db:seed
   ```

2. **Import Real Images**:
   ```bash
   # Download and import HRF fundus images (~30 real images)
   bun run db:seed-hrf
   ```

3. **Clean Up (after import)**:
   ```bash
   # Remove redundant files (ZIPs, extracted dirs, orphaned images)
   bun run db:cleanup
   ```

## Directory Structure

```
apps/server/
├── data/
│   ├── datasets/          # Raw dataset files (temporary)
│   │   └── hrf/           # HRF dataset
│   └── images/            # Processed image files
│       ├── *.jpg          # Original images (30 HRF images)
│       └── *-thumb.jpeg   # Thumbnails (30 thumbnails)
├── scripts/
│   ├── seed-hrf.ts        # HRF dataset import
│   ├── cleanup-full.ts    # Full cleanup script
│   └── README.md          # This file
└── src/
    └── db/
        ├── seed.ts        # Main database seed
        └── schema.ts      # Database schema
```

## Notes

- The main `db:seed` script creates database structure only (no images)
- Real images must be imported separately using `db:seed-hrf`
- The HRF dataset provides ~45 fundus images (15 per category)
- Images are limited to 10 per category by default (configurable in script)
- After import, run `db:cleanup` to free ~1.9 GB of disk space
