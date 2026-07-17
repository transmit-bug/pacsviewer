#!/usr/bin/env bun
/**
 * Seed script for HRF (High-Resolution Fundus) dataset.
 *
 * Downloads real fundus images from the HRF dataset and seeds them
 * into the PACS Viewer database. This replaces synthetic test images
 * with real ophthalmic imaging data.
 *
 * Dataset: High-Resolution Fundus (HRF) Image Database
 * Source: Friedrich-Alexander-Universität Erlangen-Nürnberg
 * License: Free for research and educational use
 *
 * Usage:
 *   bun run scripts/seed-hrf.ts
 *
 * What it does:
 *   1. Downloads HRF dataset ZIP files (healthy, glaucoma, diabetic_retinopathy)
 *   2. Extracts images to data/datasets/hrf/
 *   3. Generates thumbnails
 *   4. Creates Patient → Study → Series → Image records in database
 *   5. Links to existing users (doctors) for physician assignment
 */

import { join } from 'path';
import { mkdir, writeFile, readdir, stat, unlink, rm } from 'fs/promises';
import { existsSync } from 'fs';
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';
import { db, patients, studies, series, images, users } from '../src/db';
import { eq } from 'drizzle-orm';

// ── Configuration ───────────────────────────────────────────────────────────

const BASE_DIR = join(import.meta.dir, '..');
const DATASETS_DIR = join(BASE_DIR, 'data', 'datasets');
const HRF_DIR = join(DATASETS_DIR, 'hrf');
const IMAGES_DIR = join(BASE_DIR, 'data', 'images');

const HRF_SOURCES = [
  {
    name: 'healthy',
    url: 'https://www5.cs.fau.de/fileadmin/research/datasets/fundus-images/healthy.zip',
    disease: 'normal',
    description: '正常眼底',
  },
  {
    name: 'glaucoma',
    url: 'https://www5.cs.fau.de/fileadmin/research/datasets/fundus-images/glaucoma.zip',
    disease: 'glaucoma',
    description: '青光眼',
  },
  {
    name: 'diabetic_retinopathy',
    url: 'https://www5.cs.fau.de/fileadmin/research/datasets/fundus-images/diabetic_retinopathy.zip',
    disease: 'diabetic_retinopathy',
    description: '糖尿病视网膜病变',
  },
];

const THUMBNAIL_WIDTH = 256;
const THUMBNAIL_HEIGHT = 256;
const MAX_IMAGES_PER_CATEGORY = 10; // Limit to ~10 per category as requested

// ── Helper Functions ────────────────────────────────────────────────────────

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  ⬇️  Downloading: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destPath, buffer);
  console.log(`  ✅ Saved: ${destPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  console.log(`  📦 Extracting: ${zipPath}`);
  const proc = Bun.spawn(['unzip', '-o', '-q', zipPath, '-d', destDir]);
  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error(`Failed to extract ${zipPath}`);
  }
  console.log(`  ✅ Extracted to: ${destDir}`);
}

async function generateThumbnail(imagePath: string): Promise<Buffer> {
  return sharp(imagePath)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  const metadata = await sharp(imagePath).metadata();
  return {
    width: metadata.width || 512,
    height: metadata.height || 512,
  };
}

function parseImageFilename(filename: string): { id: number; eye: 'OD' | 'OS' } | null {
  // HRF filenames: 01_h.jpg, 01_g.jpg, 01_dr.jpg
  // Also: healthy01.jpg, glaucoma01.jpg, dr01.jpg
  const match = filename.match(/(\d+)/);
  if (!match) return null;
  return {
    id: parseInt(match[1], 10),
    eye: 'OD', // Default, will be randomized
  };
}

// ── Main Seed Function ─────────────────────────────────────────────────────

async function seedHRF() {
  console.log('🌱 HRF Dataset Seed Script\n');
  console.log('═══════════════════════════════════════════════════\n');

  // Ensure directories exist
  await mkdir(HRF_DIR, { recursive: true });
  await mkdir(IMAGES_DIR, { recursive: true });

  // Get existing users for physician assignment
  const allUsers = await db.query.users.findMany();
  const doctorIds = allUsers
    .filter((u: any) => u.username === 'doctor' || u.username === 'doctor2')
    .map((u: any) => u.id);

  if (doctorIds.length === 0) {
    console.error('❌ No doctors found in database. Run db:seed first.');
    process.exit(1);
  }

  let totalPatients = 0;
  let totalStudies = 0;
  let totalSeries = 0;
  let totalImages = 0;

  // Process each HRF category
  for (const source of HRF_SOURCES) {
    console.log(`\n📂 Processing: ${source.name} (${source.description})`);
    console.log('─'.repeat(50));

    const categoryDir = join(HRF_DIR, source.name);
    const extractDir = join(HRF_DIR, `${source.name}_extracted`);

    // Download ZIP if not exists
    const zipPath = join(HRF_DIR, `${source.name}.zip`);
    if (!existsSync(zipPath)) {
      await downloadFile(source.url, zipPath);
    } else {
      console.log(`  ℹ️  ZIP already exists: ${zipPath}`);
    }

    // Extract if not already extracted
    if (!existsSync(extractDir)) {
      await extractZip(zipPath, extractDir);
    } else {
      console.log(`  ℹ️  Already extracted: ${extractDir}`);
    }

    // Find all image files
    const files: string[] = [];
    const findImages = async (dir: string) => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await findImages(fullPath);
        } else if (/\.(jpg|jpeg|png|ppm|tif|tiff)$/i.test(entry.name)) {
          files.push(fullPath);
        }
      }
    };
    await findImages(extractDir);

    console.log(`  📊 Found ${files.length} images`);

    // Limit to MAX_IMAGES_PER_CATEGORY
    const selectedFiles = files.slice(0, MAX_IMAGES_PER_CATEGORY);
    console.log(`  📊 Using ${selectedFiles.length} images (limit: ${MAX_IMAGES_PER_CATEGORY})`);

    if (selectedFiles.length === 0) {
      console.log(`  ⚠️  No images found in ${extractDir}`);
      continue;
    }

    // Create patient for this category
    const patientId = uuid();
    const mrn = `HRF-${source.name.toUpperCase()}-${Date.now()}`;
    const patientName = `HRF-${source.description}患者`;

    await db.insert(patients).values({
      id: patientId,
      mrn,
      name: patientName,
      gender: Math.random() > 0.5 ? 'male' : 'female',
      birthDate: '1970-01-01',
      phone: null,
      email: null,
      tags: JSON.stringify([]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log(`  👤 Created patient: ${patientName} (${mrn})`);
    totalPatients++;

    // Create study for this patient
    const studyId = uuid();
    const studyDate = new Date().toISOString().slice(0, 10);

    await db.insert(studies).values({
      id: studyId,
      patientId,
      studyDate,
      studyTime: '10:00:00',
      modality: 'fundus',
      device: 'HRF Camera',
      physicianId: doctorIds[Math.floor(Math.random() * doctorIds.length)],
      status: 'diagnosed',
      description: `眼底彩照检查 - ${source.description}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log(`  📋 Created study: ${studyDate} (fundus)`);
    totalStudies++;

    // Create series
    const seriesId = uuid();
    await db.insert(series).values({
      id: seriesId,
      studyId,
      seriesNumber: 1,
      seriesDescription: `HRF ${source.description} 眼底彩照`,
      modality: 'fundus',
      bodyPart: Math.random() > 0.5 ? 'OD' : 'OS',
      imageCount: selectedFiles.length,
      createdAt: new Date().toISOString(),
    });

    console.log(`  📁 Created series: HRF ${source.description}`);
    totalSeries++;

    // Process each image
    for (let i = 0; i < selectedFiles.length; i++) {
      const filePath = selectedFiles[i];
      const filename = filePath.split('/').pop() || filePath.split('\\').pop() || '';

      try {
        // Get image dimensions
        const { width, height } = await getImageDimensions(filePath);

        // Generate unique filename
        const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
        const newFilename = `${uuid()}.${ext}`;
        const thumbnailFilename = `${uuid()}-thumb.jpeg`;

        // Copy image to images directory
        const imageBuffer = await Bun.file(filePath).arrayBuffer();
        await writeFile(join(IMAGES_DIR, newFilename), Buffer.from(imageBuffer));

        // Generate and save thumbnail
        const thumbnailBuffer = await generateThumbnail(filePath);
        await writeFile(join(IMAGES_DIR, thumbnailFilename), thumbnailBuffer);

        // Create image record
        const imageId = uuid();
        await db.insert(images).values({
          id: imageId,
          seriesId,
          instanceNumber: i + 1,
          filePath: newFilename,
          fileSize: imageBuffer.byteLength,
          fileHash: `hrf_${source.name}_${filename}`,
          format: 'jpeg',
          width,
          height,
          bitsAllocated: 8,
          thumbnailPath: thumbnailFilename,
          metadata: JSON.stringify({
            modality: 'fundus',
            bodyPart: Math.random() > 0.5 ? 'OD' : 'OS',
            source: 'HRF Dataset',
            originalFilename: filename,
            disease: source.disease,
            description: source.description,
          }),
          createdAt: new Date().toISOString(),
        });

        totalImages++;
        console.log(`  ✅ [${i + 1}/${selectedFiles.length}] ${filename} → ${newFilename}`);
      } catch (error) {
        console.error(`  ❌ Failed to process ${filename}:`, error);
      }
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  HRF Dataset Seed Summary');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Patients created:  ${totalPatients}`);
  console.log(`  Studies created:   ${totalStudies}`);
  console.log(`  Series created:    ${totalSeries}`);
  console.log(`  Images imported:   ${totalImages}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('\n  Dataset files stored in: data/datasets/hrf/');
  console.log('  Image files stored in:   data/images/');
  console.log('\n🎉 HRF seed completed!\n');
}

// ── Run ─────────────────────────────────────────────────────────────────────

seedHRF().catch((err) => {
  console.error('❌ HRF seed failed:', err);
  process.exit(1);
});
