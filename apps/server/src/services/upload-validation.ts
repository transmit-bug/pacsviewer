/**
 * Upload validation helpers (#136 决议：手动导入 1.0 试点).
 *
 * Locked limits: maxFiles = 200 / batch, per-file size cap = 100MB.
 * Standard formats only — DICOM goes through /upload-dicom, raster images
 * (JPEG/PNG/TIFF/BMP) through /upload and /upload/batch. Vendor proprietary
 * OCT exports are explicitly out of scope.
 *
 * Batch failure policy: skip failed files, continue, report per file —
 * see partitionBatchFiles().
 */

/** Per-file upload size cap: 100MB. */
export const MAX_UPLOAD_FILE_SIZE = 100 * 1024 * 1024;

/** Max files per batch (OCT sequences routinely exceed 100 frames). */
export const MAX_UPLOAD_BATCH_FILES = 200;

/** Formats the images table can store (schema enum) and /upload accepts. */
export const UPLOADABLE_FORMATS = ['jpeg', 'png', 'tiff', 'bmp'];

/** Normalize a file extension to the images.format enum value ('' if unknown). */
export function normalizeImageFormat(ext: string | undefined): string {
  const e = (ext || '').toLowerCase();
  if (e === 'jpg' || e === 'jpeg') return 'jpeg';
  if (e === 'tif' || e === 'tiff') return 'tiff';
  if (e === 'png') return 'png';
  if (e === 'bmp') return 'bmp';
  return e;
}

/**
 * Returns a Chinese error message when `size` exceeds the per-file cap,
 * or null when the size is acceptable. Kept as a pure function so callers
 * can pass a custom cap in tests without allocating 100MB buffers.
 */
export function checkFileSize(
  size: number,
  maxBytes: number = MAX_UPLOAD_FILE_SIZE
): string | null {
  if (!Number.isFinite(size) || size < 0) {
    return '无法读取文件大小';
  }
  if (size > maxBytes) {
    return `文件超过大小上限（${Math.floor(maxBytes / 1024 / 1024)}MB），请压缩后再上传`;
  }
  return null;
}

/**
 * Result of validating one uploaded file's name/extension against the
 * supported format whitelist.
 */
export type FormatCheck =
  | { ok: true; format: string }
  | { ok: false; error: string };

/**
 * Validate an uploaded image filename against UPLOADABLE_FORMATS.
 * Returns the normalized format, or a Chinese error naming the file.
 */
export function checkImageFormat(fileName: string): FormatCheck {
  const ext = fileName.split('.').pop();
  const format = normalizeImageFormat(ext);
  if (!UPLOADABLE_FORMATS.includes(format)) {
    return {
      ok: false,
      error: `不支持的文件格式: ${fileName}（支持 PNG/JPEG/TIFF/BMP，DICOM 请使用 DICOM 上传）`,
    };
  }
  return { ok: true, format };
}

/** A single file rejected during batch validation, with its reason. */
export interface RejectedFile {
  fileName: string;
  reason: string;
}

/**
 * Split a batch of candidate uploads into accepted/rejected lists WITHOUT
 * aborting on the first bad file (#136 批量失败策略：跳过失败继续导入，逐文件报告).
 *
 * Only checks cheap metadata (name extension + declared size); actual byte
 * processing stays in the route handler.
 */
export function partitionBatchFiles<T extends { name: string; size: number }>(
  files: T[],
  opts: { maxFiles?: number; maxFileSize?: number } = {}
): { accepted: Array<T & { format: string }>; rejected: RejectedFile[] } {
  const maxFiles = opts.maxFiles ?? MAX_UPLOAD_BATCH_FILES;
  const maxFileSize = opts.maxFileSize ?? MAX_UPLOAD_FILE_SIZE;

  const rejected: RejectedFile[] = [];
  const candidates: Array<T & { format: string }> = [];

  for (const file of files) {
    // Oversized → reject this file only.
    const sizeError = checkFileSize(file.size, maxFileSize);
    if (sizeError) {
      rejected.push({ fileName: file.name, reason: sizeError });
      continue;
    }
    // Unsupported extension → reject this file only.
    const formatCheck = checkImageFormat(file.name);
    if (!formatCheck.ok) {
      rejected.push({ fileName: file.name, reason: formatCheck.error });
      continue;
    }
    candidates.push(Object.assign(file, { format: formatCheck.format }));
  }

  // Enforce the batch ceiling AFTER format/size filtering so valid files
  // beyond the limit get an explicit reason instead of vanishing silently.
  const overflow = candidates.slice(maxFiles);
  for (const file of overflow) {
    rejected.push({
      fileName: file.name,
      reason: `超出单批 ${maxFiles} 个文件的数量上限`,
    });
  }

  return { accepted: candidates.slice(0, maxFiles), rejected };
}
