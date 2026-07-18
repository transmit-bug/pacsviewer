/**
 * DICOM Thumbnail Generator
 *
 * Generates JPEG thumbnails from DICOM files for display in study/series lists.
 * Handles common DICOM photometric interpretations:
 *   - MONOCHROME1 / MONOCHROME2
 *   - RGB
 *   - YBR_FULL / YBR_FULL_422
 *
 * Uses Sharp for image processing.
 */

import sharp from 'sharp';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import dcmjs from 'dcmjs';

const { DicomMessage, DicomMetaDictionary } = dcmjs.data;

const THUMBNAIL_SIZE = 128;
const THUMBNAIL_QUALITY = 80;

export interface ThumbnailResult {
  path: string;
  width: number;
  height: number;
}

/**
 * Generate a thumbnail from a DICOM file buffer.
 *
 * @param dicomBuffer - Raw DICOM file buffer
 * @param outputPath - Path to save the thumbnail
 * @returns Thumbnail metadata or null if generation fails
 */
export async function generateDicomThumbnail(
  dicomBuffer: Buffer,
  outputPath: string
): Promise<ThumbnailResult | null> {
  try {
    // Parse DICOM to get pixel data and metadata
    // dcmjs expects a plain ArrayBuffer
    const arrayBuffer = new ArrayBuffer(dicomBuffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < dicomBuffer.length; i++) {
      view[i] = dicomBuffer[i];
    }
    const dataset = DicomMessage.readFile(arrayBuffer);
    const dict = dataset.dict;

    // Helper to get value from dcmjs dict format
    const getTag = (keyword: string): any => {
      const entry = DicomMetaDictionary.nameMap?.[keyword];
      if (!entry?.tag) return undefined;
      const tagKey = entry.tag.replace(/[(),]/g, '');
      const dictEntry = dict[tagKey];
      return dictEntry?.Value?.[0];
    };

    const rows = getTag('Rows') as number;
    const columns = getTag('Columns') as number;
    const bitsAllocated = (getTag('BitsAllocated') as number) || 8;
    const bitsStored = (getTag('BitsStored') as number) || bitsAllocated;
    const samplesPerPixel = (getTag('SamplesPerPixel') as number) || 1;
    const photometric = (getTag('PhotometricInterpretation') as string) || 'MONOCHROME2';
    const pixelRepresentation = (getTag('PixelRepresentation') as number) || 0;

    if (!rows || !columns) {
      console.warn('[Thumbnail] Missing Rows/Columns in DICOM metadata');
      return null;
    }

    // Extract pixel data from dcmjs dict (7FE00010 is the PixelData tag)
    let pixelData: Buffer | null = null;
    const pixelDataEntry = dict['7FE00010'];
    if (pixelDataEntry?.Value && pixelDataEntry.Value.length > 0) {
      const raw = pixelDataEntry.Value[0];
      if (Buffer.isBuffer(raw)) {
        pixelData = raw;
      } else if (raw instanceof ArrayBuffer) {
        pixelData = Buffer.from(new Uint8Array(raw));
      } else if (raw instanceof Uint8Array) {
        pixelData = Buffer.from(raw);
      } else if (typeof raw === 'object' && raw.InlineBinary) {
        pixelData = Buffer.from(raw.InlineBinary, 'base64');
      } else if (typeof raw === 'string') {
        pixelData = Buffer.from(raw, 'base64');
      }
    }

    if (!pixelData || pixelData.length === 0) {
      console.warn('[Thumbnail] No pixel data found in DICOM file');
      return null;
    }

    // Create the output directory
    const outputDir = join(outputPath, '..');
    await mkdir(outputDir, { recursive: true });

    // Convert pixel data to RGB for Sharp
    const rgbBuffer = convertToRgb(pixelData, rows, columns, samplesPerPixel, photometric, bitsStored, pixelRepresentation);

    if (!rgbBuffer) {
      console.warn('[Thumbnail] Failed to convert pixel data to RGB');
      return null;
    }

    // Generate thumbnail using Sharp
    await sharp(rgbBuffer, {
      raw: {
        width: columns,
        height: rows,
        channels: 3, // RGB
      },
    })
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toFile(outputPath);

    // Get actual dimensions of the generated thumbnail
    const metadata = await sharp(outputPath).metadata();

    return {
      path: outputPath,
      width: metadata.width || THUMBNAIL_SIZE,
      height: metadata.height || THUMBNAIL_SIZE,
    };
  } catch (err) {
    console.error('[Thumbnail] Error generating DICOM thumbnail:', err);
    return null;
  }
}

/**
 * Convert DICOM pixel data to RGB buffer for Sharp processing.
 */
function convertToRgb(
  pixelData: Buffer,
  rows: number,
  columns: number,
  samplesPerPixel: number,
  photometric: string,
  bitsStored: number,
  pixelRepresentation: number
): Buffer | null {
  try {
    const pixelCount = rows * columns;
    const expectedSize = pixelCount * samplesPerPixel * (bitsStored > 8 ? 2 : 1);

    if (pixelData.length < expectedSize) {
      console.warn(`[Thumbnail] Pixel data too small: ${pixelData.length} < ${expectedSize}`);
      return null;
    }

    if (samplesPerPixel === 3 || photometric.includes('RGB') || photometric.includes('YBR')) {
      // Already RGB or YBR - convert to RGB
      return convertColorToRgb(pixelData, rows, columns, photometric);
    }

    // Grayscale image (MONOCHROME1 or MONOCHROME2)
    return convertGrayscaleToRgb(pixelData, rows, columns, bitsStored, pixelRepresentation, photometric);
  } catch (err) {
    console.error('[Thumbnail] Pixel conversion error:', err);
    return null;
  }
}

/**
 * Convert grayscale DICOM pixel data to RGB.
 */
function convertGrayscaleToRgb(
  pixelData: Buffer,
  rows: number,
  columns: number,
  bitsStored: number,
  pixelRepresentation: number,
  photometric: string
): Buffer {
  const pixelCount = rows * columns;
  const rgbBuffer = Buffer.alloc(pixelCount * 3);
  const isMonochrome1 = photometric === 'MONOCHROME1';
  const bytesPerSample = bitsStored > 8 ? 2 : 1;

  // Calculate window for display (simple min/max normalization)
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < pixelCount; i++) {
    let value: number;
    if (bytesPerSample === 2) {
      value = pixelRepresentation ? pixelData.readInt16LE(i * 2) : pixelData.readUInt16LE(i * 2);
    } else {
      value = pixelData[i];
    }
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = max - min || 1;

  // Convert to RGB
  for (let i = 0; i < pixelCount; i++) {
    let value: number;
    if (bytesPerSample === 2) {
      value = pixelRepresentation ? pixelData.readInt16LE(i * 2) : pixelData.readUInt16LE(i * 2);
    } else {
      value = pixelData[i];
    }

    // Normalize to 0-255
    let normalized = Math.round(((value - min) / range) * 255);

    // Invert for MONOCHROME1
    if (isMonochrome1) {
      normalized = 255 - normalized;
    }

    const offset = i * 3;
    rgbBuffer[offset] = normalized;
    rgbBuffer[offset + 1] = normalized;
    rgbBuffer[offset + 2] = normalized;
  }

  return rgbBuffer;
}

/**
 * Convert color (RGB/YBR) DICOM pixel data to RGB.
 */
function convertColorToRgb(
  pixelData: Buffer,
  rows: number,
  columns: number,
  photometric: string
): Buffer {
  const pixelCount = rows * columns;

  if (photometric.includes('RGB') || photometric === 'YBR_FULL') {
    // Already in a format Sharp can handle with minor adjustment
    const rgbBuffer = Buffer.alloc(pixelCount * 3);

    if (photometric === 'YBR_FULL') {
      // Convert YBR to RGB
      for (let i = 0; i < pixelCount; i++) {
        const offset = i * 3;
        const y = pixelData[offset];
        const cb = pixelData[offset + 1];
        const cr = pixelData[offset + 2];

        // YBR to RGB conversion
        rgbBuffer[offset] = clamp(y + 1.402 * (cr - 128));
        rgbBuffer[offset + 1] = clamp(y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128));
        rgbBuffer[offset + 2] = clamp(y + 1.772 * (cb - 128));
      }
    } else {
      // RGB - copy directly
      pixelData.copy(rgbBuffer, 0, 0, pixelCount * 3);
    }

    return rgbBuffer;
  }

  // YBR_FULL_422 - subsampled chroma
  if (photometric === 'YBR_FULL_422') {
    const rgbBuffer = Buffer.alloc(pixelCount * 3);

    for (let i = 0; i < pixelCount; i++) {
      const srcOffset = Math.floor(i / 2) * 4 + (i % 2);
      const dstOffset = i * 3;
      const y = pixelData[srcOffset];
      const cb = pixelData[Math.floor(i / 2) * 4 + 2];
      const cr = pixelData[Math.floor(i / 2) * 4 + 3];

      rgbBuffer[dstOffset] = clamp(y + 1.402 * (cr - 128));
      rgbBuffer[dstOffset + 1] = clamp(y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128));
      rgbBuffer[dstOffset + 2] = clamp(y + 1.772 * (cb - 128));
    }

    return rgbBuffer;
  }

  // Fallback: treat as RGB
  const rgbBuffer = Buffer.alloc(pixelCount * 3);
  pixelData.copy(rgbBuffer, 0, 0, Math.min(pixelData.length, pixelCount * 3));
  return rgbBuffer;
}

/**
 * Clamp a value to 0-255 range.
 */
function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Generate thumbnail path for a DICOM image.
 */
export function getThumbnailPath(sopInstanceUid: string): string {
  const safeUid = sopInstanceUid.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `data/thumbnails/${safeUid}.jpg`;
}
