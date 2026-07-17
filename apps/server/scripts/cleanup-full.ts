#!/usr/bin/env bun
/**
 * Full cleanup script: remove all redundant files after HRF import.
 *
 * Removes:
 *   1. Old synthetic images from data/images/
 *   2. HRF ZIP files from data/datasets/hrf/
 *   3. HRF extracted directories from data/datasets/hrf/
 *
 * Keeps:
 *   - Only files referenced in database (HRF images + thumbnails)
 *
 * Usage:
 *   bun run scripts/cleanup-full.ts
 */

import { join } from 'path';
import { readdir, unlink, stat, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { db, images } from '../src/db';

const BASE_DIR = join(import.meta.dir, '..');
const IMAGES_DIR = join(BASE_DIR, 'data', 'images');
const DATASETS_DIR = join(BASE_DIR, 'data', 'datasets');
const HRF_DIR = join(DATASETS_DIR, 'hrf');

async function getReferencedFiles(): Promise<Set<string>> {
  const allImages = await db.query.images.findMany();
  const files = new Set<string>();
  for (const img of allImages) {
    files.add(img.filePath);
    if (img.thumbnailPath) files.add(img.thumbnailPath);
  }
  return files;
}

async function cleanOrphanedImages(referencedFiles: Set<string>): Promise<{ deleted: number; size: number }> {
  const allFiles = await readdir(IMAGES_DIR);
  const orphaned = allFiles.filter(f => !referencedFiles.has(f));

  let deleted = 0;
  let size = 0;

  for (const file of orphaned) {
    const filePath = join(IMAGES_DIR, file);
    try {
      const stats = await stat(filePath);
      size += stats.size;
      await unlink(filePath);
      deleted++;
    } catch {}
  }

  return { deleted, size };
}

async function cleanDatasets(): Promise<{ deleted: number; size: number }> {
  let deleted = 0;
  let size = 0;

  if (!existsSync(HRF_DIR)) {
    return { deleted, size };
  }

  // Calculate size of ZIP files and extracted dirs
  const entries = await readdir(HRF_DIR, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(HRF_DIR, entry.name);
    try {
      const stats = await stat(fullPath);
      if (entry.isFile() && entry.name.endsWith('.zip')) {
        size += stats.size;
        await unlink(fullPath);
        deleted++;
        console.log(`  🗑️  Deleted ZIP: ${entry.name}`);
      } else if (entry.isDirectory() && entry.name.endsWith('_extracted')) {
        size += stats.size;
        await rm(fullPath, { recursive: true, force: true });
        deleted++;
        console.log(`  🗑️  Deleted dir: ${entry.name}/`);
      }
    } catch {}
  }

  return { deleted, size };
}

async function main() {
  console.log('🧹 Full Cleanup Script\n');
  console.log('═══════════════════════════════════════════════════\n');

  // Get referenced files
  const referencedFiles = await getReferencedFiles();
  console.log(`📊 Files referenced in database: ${referencedFiles.size}\n`);

  // Clean orphaned images
  console.log('🗑️  Cleaning orphaned images from data/images/...');
  const imageResult = await cleanOrphanedImages(referencedFiles);
  console.log(`  Deleted: ${imageResult.deleted} files (${(imageResult.size / 1024 / 1024).toFixed(1)} MB)\n`);

  // Clean datasets
  console.log('🗑️  Cleaning HRF dataset files...');
  const datasetResult = await cleanDatasets();
  console.log(`  Deleted: ${datasetResult.deleted} items (${(datasetResult.size / 1024 / 1024).toFixed(1)} MB)\n`);

  // Summary
  const totalSize = imageResult.size + datasetResult.size;
  console.log('═══════════════════════════════════════════════════');
  console.log('  Cleanup Summary');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Orphaned images deleted: ${imageResult.deleted}`);
  console.log(`  Dataset files deleted:   ${datasetResult.deleted}`);
  console.log(`  Total space freed:       ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log('═══════════════════════════════════════════════════\n');

  // Show remaining
  const remainingImages = await readdir(IMAGES_DIR);
  console.log(`📊 Remaining files in data/images/: ${remainingImages.length}`);

  if (existsSync(DATASETS_DIR)) {
    const remainingDatasets = await readdir(DATASETS_DIR, { withFileTypes: true });
    const dirs = remainingDatasets.filter(d => d.isDirectory()).length;
    const files = remainingDatasets.filter(d => d.isFile()).length;
    console.log(`📊 Remaining in data/datasets/: ${dirs} dirs, ${files} files`);
  }

  console.log('\n🎉 Cleanup completed!');
}

main().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
