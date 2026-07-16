/**
 * Image Pyramid Service — generates and serves multi-resolution image tiles.
 *
 * Pre-generates 4 resolution levels using Sharp:
 *   - 256px  (thumbnail / overview)
 *   - 512px  (zoomed out)
 *   - 1024px (normal view)
 *   - full   (original resolution, zoomed in)
 */

import sharp from 'sharp';
import { join } from 'path';
import { mkdir, stat } from 'fs/promises';
import { db, images } from '../db';
import { eq } from 'drizzle-orm';

export const PYRAMID_LEVELS = [
  { name: '256', size: 256 },
  { name: '512', size: 512 },
  { name: '1024', size: 1024 },
] as const;

export type PyramidLevel = typeof PYRAMID_LEVELS[number]['name'] | 'full';

const PYRAMID_DIR = join(process.cwd(), 'data', 'pyramid');

/**
 * Ensure pyramid directory exists.
 */
async function ensureDir(): Promise<void> {
  await mkdir(PYRAMID_DIR, { recursive: true });
}

/**
 * Get the file path for a pyramid level.
 */
export function getPyramidPath(imageId: string, level: PyramidLevel): string {
  return join(PYRAMID_DIR, `${imageId}_${level}.webp`);
}

/**
 * Check if a pyramid level already exists.
 */
export async function pyramidExists(imageId: string, level: PyramidLevel): Promise<boolean> {
  try {
    await stat(getPyramidPath(imageId, level));
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate all pyramid levels for an image.
 * Called lazily on first request, then cached on disk.
 */
export async function generatePyramid(imageId: string): Promise<void> {
  await ensureDir();

  // Get original image
  const image = await db.query.images.findFirst({
    where: eq(images.id, imageId),
  });

  if (!image) throw new Error(`Image not found: ${imageId}`);

  const originalPath = join(process.cwd(), 'data', 'images', image.filePath);
  const originalFile = Bun.file(originalPath);
  if (!(await originalFile.exists())) throw new Error(`File not found: ${originalPath}`);

  const buffer = Buffer.from(await originalFile.arrayBuffer());

  // Generate each level
  const tasks = PYRAMID_LEVELS.map(async ({ name, size }) => {
    const outputPath = getPyramidPath(imageId, name as PyramidLevel);
    if (await pyramidExists(imageId, name as PyramidLevel)) return;

    await sharp(buffer)
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(outputPath);
  });

  // Full resolution — just convert to webp for faster serving
  const fullPath = getPyramidPath(imageId, 'full');
  if (!(await pyramidExists(imageId, 'full'))) {
    tasks.push(
      (async () => {
        await sharp(buffer).webp({ quality: 90 }).toFile(fullPath);
      })()
    );
  }

  await Promise.all(tasks);
}

/**
 * Serve a pyramid level. Returns the file path if it exists.
 */
export function getPyramidFilePath(imageId: string, level: PyramidLevel): string {
  return getPyramidPath(imageId, level);
}

/**
 * Determine the best pyramid level for a given viewport size.
 */
export function selectPyramidLevel(viewportWidth: number, viewportHeight: number, zoom: number): PyramidLevel {
  const effectiveSize = Math.max(viewportWidth, viewportHeight) * zoom;

  if (effectiveSize <= 256) return '256';
  if (effectiveSize <= 512) return '512';
  if (effectiveSize <= 1024) return '1024';
  return 'full';
}
