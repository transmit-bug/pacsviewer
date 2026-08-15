import { describe, test, expect } from 'bun:test';
import sharp from 'sharp';
import dcmjs from 'dcmjs';
import { convertImageToDicom } from '../image-to-dicom';

const { DicomMessage } = dcmjs.data;

/** Generate a tiny RGB PNG buffer for conversion tests. */
async function makePng(width = 8, height = 8): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 120, b: 120 },
    },
  })
    .png()
    .toBuffer();
}

/** Buffer → exact-size ArrayBuffer (dcmjs readFile expects ArrayBuffer). */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
}

describe('convertImageToDicom pixelSpacing', () => {
  test('defaults to null when not provided', async () => {
    const img = await makePng();
    const result = await convertImageToDicom({ imageBuffer: img, filename: 'test.png' });
    expect(result.parseResult.metadata.image.pixelSpacing).toBeNull();
  });

  test('writes PixelSpacing into metadata and DICOM binary when provided', async () => {
    const img = await makePng();
    const result = await convertImageToDicom({
      imageBuffer: img,
      filename: 'test.png',
      pixelSpacing: [0.04, 0.04],
    });

    // Metadata path (used by storage / image records)
    expect(result.parseResult.metadata.image.pixelSpacing).toEqual([0.04, 0.04]);

    // Binary path (what Cornerstone parses at render time)
    const dataset = DicomMessage.readFile(toArrayBuffer(result.parseResult.buffer)).dict;
    const spacing = dataset['00280030']?.Value?.map(Number);
    expect(spacing).toEqual([0.04, 0.04]);
  });

  test('explicit null stays null in the binary', async () => {
    const img = await makePng();
    const result = await convertImageToDicom({
      imageBuffer: img,
      filename: 'test.png',
      pixelSpacing: null,
    });
    expect(result.parseResult.metadata.image.pixelSpacing).toBeNull();
    const dataset = DicomMessage.readFile(toArrayBuffer(result.parseResult.buffer)).dict;
    expect(dataset['00280030']).toBeUndefined();
  });
});
