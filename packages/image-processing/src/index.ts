/**
 * Image Processing Module
 *
 * Provides:
 *   computeHash(buffer) → SHA-256 hash
 *   extractMetadata(buffer, format) → ImageMetadata
 *   generateThumbnail(buffer, options) → Buffer
 */

import sharp from 'sharp';

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  bitsPerSample?: number;
  channels?: number;
  hasAlpha?: boolean;
  density?: number;
}

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

/**
 * Compute SHA-256 hash of a buffer.
 */
export async function computeHash(buffer: Buffer): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Extract image metadata from a buffer.
 */
export async function extractMetadata(buffer: Buffer): Promise<ImageMetadata> {
  const metadata = await sharp(buffer).metadata();

  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? 'unknown',
    bitsPerSample: metadata.depth ? parseInt(metadata.depth) : undefined,
    channels: metadata.channels,
    hasAlpha: metadata.hasAlpha,
    density: metadata.density,
  };
}

/**
 * Generate a thumbnail from an image buffer.
 */
export async function generateThumbnail(
  buffer: Buffer,
  options: ThumbnailOptions = {},
): Promise<Buffer> {
  const { width = 200, height = 200, quality = 80, format = 'jpeg' } = options;

  return sharp(buffer)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    [format]({ quality })
    .toBuffer();
}

/**
 * Process an uploaded image: extract metadata, compute hash, generate thumbnail.
 */
export async function processImage(
  buffer: Buffer,
  filename: string,
): Promise<{
  hash: string;
  metadata: ImageMetadata;
  thumbnail: Buffer;
}> {
  const [hash, metadata, thumbnail] = await Promise.all([
    computeHash(buffer),
    extractMetadata(buffer),
    generateThumbnail(buffer),
  ]);

  return { hash, metadata, thumbnail };
}
