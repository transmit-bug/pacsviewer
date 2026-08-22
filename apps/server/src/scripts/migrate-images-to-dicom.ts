/**
 * Migration Script — Convert existing PNG/JPG images to DICOM format.
 *
 * This script iterates over all non-DICOM images in the database,
 * converts them to DICOM format, and updates the database records.
 *
 * Usage: bun run apps/server/src/scripts/migrate-images-to-dicom.ts
 */

import { db, images, } from '../db';
import { eq, ne } from 'drizzle-orm';
import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import { convertImageToDicom } from '../services/image-to-dicom';

const DICOM_STORE_DIR = join(process.cwd(), 'data', 'dicom');

async function migrateImages() {
  console.log('🔄 Starting image-to-DICOM migration...');

  // Find all non-DICOM images
  const nonDicomImages = await db.query.images.findMany({
    where: ne(images.format, 'dicom'),
    with: {
      series: {
        with: {
          study: true,
        },
      },
    },
  });

  console.log(`📊 Found ${nonDicomImages.length} non-DICOM images to migrate`);

  let migrated = 0;
  const skipped = 0;
  let failed = 0;

  for (const image of nonDicomImages) {
    try {
      // Read the original file
      const originalPath = join(process.cwd(), 'data', 'images', image.filePath);
      const buffer = await readFile(originalPath);

      // Get study/series info for DICOM metadata
      const seriesRecord = image.series;
      const studyRecord = seriesRecord?.study;

      // Convert to DICOM
      const { parseResult, sopInstanceUid } = await convertImageToDicom({
        imageBuffer: buffer,
        filename: image.filePath,
        patientName: studyRecord?.patientId || 'Anonymous',
        studyInstanceUid: studyRecord?.studyInstanceUid ?? undefined,
        seriesInstanceUid: seriesRecord?.seriesInstanceUid ?? undefined,
        instanceNumber: image.instanceNumber,
      });

      // Store DICOM file
      await mkdir(DICOM_STORE_DIR, { recursive: true });
      const dicomFilename = `${uuid()}.dcm`;
      const dicomFilePath = join(DICOM_STORE_DIR, dicomFilename);
      await writeFile(dicomFilePath, parseResult.buffer);

      // Update database record
      await db.update(images)
        .set({
          format: 'dicom',
          filePath: dicomFilename,
          fileSize: parseResult.buffer.length,
          sopInstanceUid,
          sopClassUid: parseResult.metadata.image.sopClassUid,
          transferSyntaxUid: parseResult.metadata.image.transferSyntaxUid,
          photometricInterpretation: parseResult.metadata.image.photometricInterpretation,
        })
        .where(eq(images.id, image.id));

      migrated++;
      console.log(`✅ [${migrated}/${nonDicomImages.length}] Migrated: ${image.id} (${image.format} → dicom)`);
    } catch (err) {
      failed++;
      console.error(`❌ Failed to migrate image ${image.id}:`, err);
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`  Total: ${nonDicomImages.length}`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log('✅ Migration complete!');
}

// Run the migration
migrateImages().catch(console.error);
