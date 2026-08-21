/**
 * Unit tests for upload validation helpers (#136 决议).
 *
 * Locked limits: maxFiles = 200 / batch, per-file cap = 100MB.
 * Batch policy: skip failed files, continue, report per file.
 */
import { describe, test, expect } from 'bun:test';
import {
  MAX_UPLOAD_FILE_SIZE,
  MAX_UPLOAD_BATCH_FILES,
  UPLOADABLE_FORMATS,
  normalizeImageFormat,
  checkFileSize,
  checkImageFormat,
  partitionBatchFiles,
} from '../src/services/upload-validation';

describe('normalizeImageFormat', () => {
  test('maps common aliases to schema enum values', () => {
    expect(normalizeImageFormat('jpg')).toBe('jpeg');
    expect(normalizeImageFormat('JPEG')).toBe('jpeg');
    expect(normalizeImageFormat('tif')).toBe('tiff');
    expect(normalizeImageFormat('Tiff')).toBe('tiff');
    expect(normalizeImageFormat('png')).toBe('png');
    expect(normalizeImageFormat('bmp')).toBe('bmp');
  });

  test('passes through unknown extensions untouched', () => {
    expect(normalizeImageFormat('webp')).toBe('webp');
    expect(normalizeImageFormat(undefined)).toBe('');
  });
});

describe('checkFileSize (per-file 100MB cap)', () => {
  test('accepts sizes up to and including the cap', () => {
    expect(checkFileSize(0)).toBeNull();
    expect(checkFileSize(MAX_UPLOAD_FILE_SIZE)).toBeNull();
    expect(checkFileSize(1024)).toBeNull();
  });

  test('rejects sizes over the cap with a Chinese message', () => {
    const err = checkFileSize(MAX_UPLOAD_FILE_SIZE + 1);
    expect(err).not.toBeNull();
    expect(err).toContain('100MB');
  });

  test('rejects invalid sizes', () => {
    expect(checkFileSize(-1)).not.toBeNull();
    expect(checkFileSize(NaN)).not.toBeNull();
  });

  test('supports a custom cap for testing without huge buffers', () => {
    expect(checkFileSize(11, 10)).toContain('大小上限');
    expect(checkFileSize(10, 10)).toBeNull();
  });
});

describe('checkImageFormat (format whitelist)', () => {
  test('accepts all supported raster formats regardless of case', () => {
    for (const fmt of UPLOADABLE_FORMATS) {
      const res = checkImageFormat(`scan.${fmt}`);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.format).toBe(fmt === 'jpg' ? 'jpeg' : fmt);
    }
    expect(checkImageFormat('photo.JPG').ok).toBe(true);
    expect(checkImageFormat('archive.TIF').ok).toBe(true);
  });

  test('rejects unsupported formats with a Chinese error naming the file', () => {
    for (const name of ['photo.webp', 'movie.gif', 'doc.pdf', 'noext']) {
      const res = checkImageFormat(name);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain(name);
        expect(res.error).toContain('不支持的文件格式');
      }
    }
  });

  test('DICOM files are rejected here (they belong to /upload-dicom)', () => {
    const res = checkImageFormat('slice.dcm');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('DICOM');
  });
});

describe('partitionBatchFiles (skip-and-continue, per-file report)', () => {
  const MB = 1024 * 1024;

  test('separates good and bad files without aborting the batch', () => {
    const { accepted, rejected } = partitionBatchFiles([
      { name: 'a.png', size: 1 * MB },
      { name: 'bad.webp', size: 1 * MB },
      { name: 'b.jpg', size: 2 * MB },
      { name: 'huge.png', size: 150 * MB }, // over the 100MB cap
    ]);

    expect(accepted.map((f) => f.name)).toEqual(['a.png', 'b.jpg']);
    expect(accepted.map((f) => f.format)).toEqual(['png', 'jpeg']);

    // Per-file failure reasons, in input order.
    expect(rejected.map((r) => r.fileName)).toEqual(['bad.webp', 'huge.png']);
    expect(rejected[0].reason).toContain('不支持的文件格式');
    expect(rejected[1].reason).toContain('100MB');
  });

  test('keeps every accepted entry usable as the original object', () => {
    const file = new File([new Uint8Array([1])], 'ok.bmp', { type: 'image/bmp' });
    const { accepted } = partitionBatchFiles([file]);
    expect(accepted.length).toBe(1);
    expect(accepted[0]).toBeInstanceOf(File);
    expect((accepted[0] as File & { format: string }).format).toBe('bmp');
  });

  test('enforces the 200-files-per-batch ceiling on valid files', () => {
    const files = Array.from({ length: MAX_UPLOAD_BATCH_FILES + 5 }, (_, i) => ({
      name: `img-${i}.png`,
      size: 1,
    }));
    const { accepted, rejected } = partitionBatchFiles(files);

    expect(accepted.length).toBe(MAX_UPLOAD_BATCH_FILES);
    expect(rejected.length).toBe(5);
    for (const r of rejected) {
      expect(r.reason).toContain(`${MAX_UPLOAD_BATCH_FILES}`);
    }
  });

  test('custom caps are honored (small-buffer test path)', () => {
    const { accepted, rejected } = partitionBatchFiles(
      [
        { name: 'a.png', size: 8 },
        { name: 'b.png', size: 20 },
        { name: 'c.gif', size: 1 },
      ],
      { maxFiles: 1, maxFileSize: 10 }
    );
    expect(accepted.map((f) => f.name)).toEqual(['a.png']);
    expect(rejected.map((r) => r.fileName)).toEqual(['b.png', 'c.gif']);
  });

  test('empty batch yields empty results', () => {
    const { accepted, rejected } = partitionBatchFiles([]);
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });
});
