/**
 * Images route - Uses image processing module for metadata extraction.
 */

import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { db, images, series, studies, annotations, layers } from '../db';
import { processImage } from '@pacsviewer/image-processing';
import { NotFoundError, ValidationError } from '../lib/errors';
import { log } from '../lib/audit';
import { AuditEvents } from '../lib/audit-events';
import { generatePyramid, getPyramidFilePath, selectPyramidLevel, type PyramidLevel } from '../services/pyramid';
import { parseDicomFile, isDicomFile, storeDicomFile, getDicomFilePath } from '../services/dicom';
import {
  checkFileSize,
  checkImageFormat,
  partitionBatchFiles,
} from '../services/upload-validation';

const imagesRouter = new Hono();

// ── Dev fallback config ─────────────────────────────────────────────────────
// When enabled, missing image files serve a placeholder instead of 404.
// Enabled by default in non-production. Remove this entire block for production.
// Opt-out: set DEV_FALLBACK_IMAGE=false
const DEV_FALLBACK_ENABLED =
  process.env.NODE_ENV !== 'production' &&
  process.env.DEV_FALLBACK_IMAGE !== 'false';

// Fallback images: synthetic fundus images for development
const FALLBACK_DIR = join(process.cwd(), 'data', 'images');
const FALLBACK_IMAGES = [
  join(FALLBACK_DIR, '_fundus_normal.png'),
  join(FALLBACK_DIR, '_fundus_dr.png'),
];
const FALLBACK_THUMBNAILS = [
  join(FALLBACK_DIR, '_fundus_normal_thumb.jpeg'),
  join(FALLBACK_DIR, '_fundus_dr_thumb.jpeg'),
];

// Synthetic fundus placeholders are 512×512. A 45° fundus camera covers roughly
// 20mm of retina across the frame → ~0.04 mm/px. Used only for DEV_FALLBACK
// synthetic data so the viewer scale bar / measurements are calibrated in demo;
// real uploads keep null (unknown optics) and fall back to display-relative HUD.
const FUNDUS_FALLBACK_SPACING: [number, number] = [0.04, 0.04];

function pickFallbackImage(paths: string[]): string {
  // Deterministic pick based on current time (changes every 10 seconds)
  const index = Math.floor(Date.now() / 10000) % paths.length;
  return paths[index];
}

async function serveFileOrFallback(filePath: string, contentType: string, fallbackPaths: string[]): Promise<Response> {
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  }
  if (DEV_FALLBACK_ENABLED) {
    const fallbackPath = pickFallbackImage(fallbackPaths);
    const fallback = Bun.file(fallbackPath);
    if (await fallback.exists()) {
      return new Response(fallback, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
          'X-Dev-Fallback': 'true',
        },
      });
    }
  }
  throw new NotFoundError('文件');
}

/**
 * True when an image record's backing file is missing and would be served as
 * a DEV_FALLBACK placeholder. Mirrors the serve decision in serveFileOrFallback
 * and the ?format=dicom conversion path.
 */
async function getImageIsFallback(image: { format: string; filePath: string }): Promise<boolean> {
  if (!DEV_FALLBACK_ENABLED) return false;

  const filePath = image.format === 'dicom'
    ? getDicomFilePath(image.filePath)
    : join(process.cwd(), 'data', 'images', image.filePath);

  if (await Bun.file(filePath).exists()) return false;

  // Any fallback asset present → this image resolves to a placeholder.
  for (const p of FALLBACK_IMAGES) {
    if (await Bun.file(p).exists()) return true;
  }
  return false;
}

// Search images by series (MUST be before /:id routes)
imagesRouter.get('/search', async (c) => {
  const seriesId = c.req.query('seriesId');
  if (!seriesId) {
    return c.json({ success: true, data: [] });
  }

  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 20));
  const offset = (page - 1) * pageSize;

  const allImages = await db.query.images.findMany({
    where: eq(images.seriesId, seriesId),
    orderBy: (i, { asc }) => [asc(i.instanceNumber)],
    limit: pageSize,
    offset,
  });

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(images)
    .where(eq(images.seriesId, seriesId));

  return c.json({
    success: true,
    data: {
      items: allImages,
      total: countResult[0].count,
      page,
      pageSize,
      totalPages: Math.ceil(countResult[0].count / pageSize),
    },
  });
});

// Upload DICOM file
imagesRouter.post('/upload-dicom', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) throw new ValidationError('请选择 DICOM 文件');

  // Per-file size cap (#136): reject BEFORE reading bytes into memory.
  const dicomSizeError = checkFileSize(file.size);
  if (dicomSizeError) throw new ValidationError(`${dicomSizeError}: ${file.name}`);

  const buffer = Buffer.from(await file.arrayBuffer());

  // Check if it's a DICOM file
  if (!isDicomFile(buffer)) {
    throw new ValidationError('不是有效的 DICOM 文件');
  }

  // Parse DICOM metadata
  const parseResult = parseDicomFile(buffer);

  // Store file and create database records
  const result = await storeDicomFile(parseResult);

  // Fine-grained explicit audit event (#138): data import via DICOM upload
  log({
    userId: (c as any).get('userId') ?? null,
    action: AuditEvents.DATA_IMPORT,
    resource: 'image',
    resourceId: result.imageId,
    details: {
      source: 'upload-dicom',
      fileName: file.name,
      isNew: result.isNew,
    },
    ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
  });

  return c.json({
    success: true,
    data: {
      imageId: result.imageId,
      patientId: result.patientId,
      studyId: result.studyId,
      seriesId: result.seriesId,
      sopInstanceUid: result.sopInstanceUid,
      isNew: result.isNew,
      metadata: parseResult.metadata,
    },
  }, result.isNew ? 201 : 200);
});

// ── Upload helpers ──────────────────────────────────────────────────────────

// normalizeImageFormat / UPLOADABLE_FORMATS now live in services/upload-validation.

/** Next instanceNumber for a series (max existing + 1, or 1). */
async function nextInstanceNumber(seriesId: string): Promise<number> {
  const result = await db
    .select({ max: sql<number>`max(${images.instanceNumber})` })
    .from(images)
    .where(eq(images.seriesId, seriesId));
  return (result[0]?.max ?? 0) + 1;
}

/**
 * Resolve the target series for an upload.
 *
 * - seriesId: append to that series (must exist).
 * - studyId: append to the latest series of the study, or create a new one
 *   when `createSeries` is set or the study has no series yet (auto-create
 *   hierarchy: upload → Series under the Study).
 */
async function resolveTargetSeries(opts: {
  seriesId?: string;
  studyId?: string;
  modality?: string;
  createSeries?: boolean;
}): Promise<{ seriesId: string; seriesNumber: number; modality: string }> {
  if (opts.seriesId) {
    const existing = await db.query.series.findFirst({
      where: eq(series.id, opts.seriesId),
    });
    if (!existing) throw new NotFoundError('序列');
    return {
      seriesId: existing.id,
      seriesNumber: existing.seriesNumber,
      modality: existing.modality,
    };
  }

  if (opts.studyId) {
    const study = await db.query.studies.findFirst({
      where: eq(studies.id, opts.studyId),
    });
    if (!study) throw new NotFoundError('检查');

    const existingSeries = await db.query.series.findMany({
      where: eq(series.studyId, study.id),
      orderBy: (s, { desc }) => [desc(s.seriesNumber)],
    });
    const latest = existingSeries[0];

    if (opts.createSeries || !latest) {
      const seriesNumber = (latest?.seriesNumber ?? 0) + 1;
      const modality = (opts.modality || study.modality || 'OT').toUpperCase();
      const newId = uuid();
      await db.insert(series).values({
        id: newId,
        studyId: study.id,
        seriesNumber,
        seriesDescription: `${modality} 序列 ${seriesNumber}`,
        modality,
        imageCount: 0,
        createdAt: new Date().toISOString(),
      });
      return { seriesId: newId, seriesNumber, modality };
    }

    return {
      seriesId: latest.id,
      seriesNumber: latest.seriesNumber,
      modality: latest.modality,
    };
  }

  throw new ValidationError('缺少 seriesId 或 studyId');
}

/**
 * Persist one uploaded image: process (hash + metadata + thumbnail via sharp),
 * write file + thumbnail under data/images, insert the image record, and bump
 * the series image count.
 */
async function storeImageFile(opts: {
  buffer: Buffer;
  originalName: string;
  seriesId: string;
  instanceNumber: number;
  fileSize: number;
  format: string;
}) {
  const uploadDir = join(process.cwd(), 'data', 'images');
  await mkdir(uploadDir, { recursive: true });

  const { hash, metadata, thumbnail } = await processImage(opts.buffer, opts.originalName);

  const ext = opts.originalName.split('.').pop() || opts.format;
  const filename = `${uuid()}.${ext}`;
  const thumbnailFilename = `${uuid()}-thumb.jpeg`;

  await Promise.all([
    writeFile(join(uploadDir, filename), opts.buffer),
    writeFile(join(uploadDir, thumbnailFilename), thumbnail),
  ]);

  const id = uuid();
  await db.insert(images).values({
    id,
    seriesId: opts.seriesId,
    instanceNumber: opts.instanceNumber,
    filePath: filename,
    fileSize: opts.fileSize,
    fileHash: hash,
    format: opts.format as any,
    width: metadata.width,
    height: metadata.height,
    bitsAllocated: metadata.bitsPerSample ?? 8,
    thumbnailPath: thumbnailFilename,
    createdAt: new Date().toISOString(),
  });

  await db.update(series)
    .set({ imageCount: sql`${series.imageCount} + 1` })
    .where(eq(series.id, opts.seriesId));

  return db.query.images.findFirst({ where: eq(images.id, id) });
}

/** Parse shared upload context fields from a multipart form. */
function uploadContext(formData: FormData) {
  return {
    seriesId: (formData.get('seriesId') as string) || undefined,
    studyId: (formData.get('studyId') as string) || undefined,
    modality: (formData.get('modality') as string) || undefined,
    createSeries: formData.get('createSeries') === 'true' || formData.get('createSeries') === '1',
  };
}

// Upload image (single). Accepts seriesId (append) or studyId (auto-create series).
imagesRouter.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  if (!file) throw new ValidationError('请选择文件');

  // Per-file size cap (#136): reject before any processing.
  const sizeError = checkFileSize(file.size);
  if (sizeError) throw new ValidationError(`${sizeError}: ${file.name}`);

  const formatCheck = checkImageFormat(file.name);
  if (!formatCheck.ok) {
    throw new ValidationError(formatCheck.error);
  }
  const format = formatCheck.format;

  const target = await resolveTargetSeries(uploadContext(formData));

  const explicitInstance = Number(formData.get('instanceNumber'));
  const instanceNumber =
    Number.isFinite(explicitInstance) && explicitInstance > 0
      ? explicitInstance
      : await nextInstanceNumber(target.seriesId);

  const buffer = Buffer.from(await file.arrayBuffer());
  const image = await storeImageFile({
    buffer,
    originalName: file.name,
    seriesId: target.seriesId,
    instanceNumber,
    fileSize: file.size,
    format,
  });

  // Fine-grained explicit audit event (#138): data import via upload
  log({
    userId: (c as any).get('userId') ?? null,
    action: AuditEvents.DATA_IMPORT,
    resource: 'image',
    resourceId: image?.id,
    details: { source: 'upload', fileName: file.name },
    ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
  });

  return c.json({ success: true, data: image }, 201);
});

// Upload multiple images in one request — all into the same series.
// Batch failure policy (#136 决议): skip failed files, continue, and report
// per-file results — one unsupported/oversized file must NOT abort the batch.
imagesRouter.post('/upload/batch', async (c) => {
  const formData = await c.req.formData();
  const files = formData.getAll('file') as File[];
  if (files.length === 0) throw new ValidationError('请选择文件');

  const { accepted, rejected } = partitionBatchFiles(files);
  if (accepted.length === 0) {
    throw new ValidationError(
      rejected.map((r) => r.reason).join('；') || '没有可上传的文件'
    );
  }

  const target = await resolveTargetSeries(uploadContext(formData));

  const items: any[] = [];
  let instanceNumber = await nextInstanceNumber(target.seriesId);
  for (const candidate of accepted) {
    // `accepted` entries are the original File objects augmented with `format`.
    const file: File = candidate;
    const buffer = Buffer.from(await file.arrayBuffer());
    const image = await storeImageFile({
      buffer,
      originalName: file.name,
      seriesId: target.seriesId,
      instanceNumber,
      fileSize: file.size,
      format: candidate.format,
    });
    items.push(image);
    instanceNumber += 1;
  }

  // Fine-grained explicit audit event (#138): batch data import
  log({
    userId: (c as any).get('userId') ?? null,
    action: AuditEvents.DATA_IMPORT,
    resource: 'image',
    resourceId: target.seriesId,
    details: { source: 'upload/batch', count: files.length },
    ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
  });

  return c.json(
    {
      success: true,
      data: {
        seriesId: target.seriesId,
        items,
        // Per-file failure report so clients can surface retryable errors.
        failed: rejected,
      },
    },
    201
  );
});

// Get image by ID
imagesRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const image = await db.query.images.findFirst({
    where: eq(images.id, id),
  });

  if (!image) throw new NotFoundError('图像');

  // Expose whether this image is a DEV_FALLBACK placeholder so the viewer can
  // mark it (demo data must not be mistaken for real patient imaging).
  const isFallback = await getImageIsFallback(image);

  return c.json({ success: true, data: { ...image, isFallback } });
});

// Get image file
imagesRouter.get('/:id/file', async (c) => {
  const id = c.req.param('id');
  const image = await db.query.images.findFirst({
    where: eq(images.id, id),
  });

  if (!image) throw new NotFoundError('图像');

  // Explicit client-initiated download (?download=1) is audited as a
  // fine-grained event (#138). Plain viewer fetches stay suppressed by the
  // middleware's LOG_ON_ERROR_ONLY rule to avoid per-frame noise.
  const isDownload = c.req.query('download') === '1';
  if (isDownload) {
    log({
      userId: (c as any).get('userId') ?? null,
      action: AuditEvents.IMAGE_DOWNLOAD,
      resource: 'image',
      resourceId: id,
      details: { fileName: image.filePath, format: image.format },
      ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
    });
  }

  // DICOM files are stored in the dicom store, not images dir
  if (image.format === 'dicom') {
    const { getDicomFilePath } = await import('../services/dicom');
    const filePath = getDicomFilePath(image.filePath);
    return serveFileOrFallback(filePath, 'application/dicom', FALLBACK_IMAGES);
  }

  // Non-DICOM images: check if Cornerstone wants DICOM format
  const wantDicom = c.req.query('format') === 'dicom';
  if (wantDicom) {
    // Convert to DICOM on-the-fly for Cornerstone. Missing files fall back to
    // a synthetic fundus image in dev — the same contract as serveFileOrFallback
    // (placeholder seed records have no backing file).
    const filePath = join(process.cwd(), 'data', 'images', image.filePath);
    const file = Bun.file(filePath);

    let buffer: Buffer;
    let usedFallback = false;
    if (await file.exists()) {
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (DEV_FALLBACK_ENABLED) {
      const fallbackPath = pickFallbackImage(FALLBACK_IMAGES);
      const fallback = Bun.file(fallbackPath);
      if (!(await fallback.exists())) throw new NotFoundError('文件');
      buffer = Buffer.from(await fallback.arrayBuffer());
      usedFallback = true;
    } else {
      throw new NotFoundError('文件');
    }

    // Get patient/study info for DICOM metadata
    const seriesRecord = await db.query.series.findFirst({
      where: eq(series.id, image.seriesId),
      with: { study: { with: { patient: true } } },
    });

    const { convertImageToDicom } = await import('../services/image-to-dicom');
    // Pixel spacing: prefer the image record (real calibration); fall back to a
    // realistic fundus spacing only for synthetic DEV_FALLBACK placeholders.
    const recordSpacing = image.pixelSpacing as [number, number] | null | undefined;
    const pixelSpacing = recordSpacing ?? (usedFallback ? FUNDUS_FALLBACK_SPACING : null);
    const result = await convertImageToDicom({
      imageBuffer: buffer,
      filename: image.filePath,
      patientName: seriesRecord?.study?.patient?.name || 'Anonymous',
      patientId: seriesRecord?.study?.patient?.mrn ?? undefined,
      studyInstanceUid: seriesRecord?.study?.studyInstanceUid ?? undefined,
      seriesInstanceUid: seriesRecord?.seriesInstanceUid ?? undefined,
      instanceNumber: image.instanceNumber,
      pixelSpacing,
    });

    return new Response(result.parseResult.buffer, {
      headers: {
        'Content-Type': 'application/dicom',
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...(usedFallback ? { 'X-Dev-Fallback': 'true' } : {}),
      },
    });
  }

  // Serve original PNG/JPG file
  const filePath = join(process.cwd(), 'data', 'images', image.filePath);
  return serveFileOrFallback(filePath, `image/${image.format}`, FALLBACK_IMAGES);
});

// Get DICOM metadata (tags)
imagesRouter.get('/:id/dicom-metadata', async (c) => {
  const id = c.req.param('id');
  const image = await db.query.images.findFirst({
    where: eq(images.id, id),
  });

  if (!image) throw new NotFoundError('图像');

  if (image.format !== 'dicom' || !image.metadata) {
    return c.json({ success: true, data: null, message: '非 DICOM 图像' });
  }

  // Parse the stored DICOM metadata into a tag list
  const dataset = image.metadata as Record<string, any>;
  const tags = Object.entries(dataset).map(([tag, entry]: [string, any]) => {
    const vr = entry?.vr || '??';
    const value = entry?.Value;
    let displayValue: string;

    if (value === undefined || value === null) {
      displayValue = '';
    } else if (Array.isArray(value)) {
      displayValue = value.map(v => {
        if (typeof v === 'object' && v !== null && 'Alphabetic' in v) return v.Alphabetic;
        return String(v);
      }).join('\\');
    } else if (typeof value === 'object' && 'Alphabetic' in value) {
      displayValue = value.Alphabetic;
    } else {
      displayValue = String(value);
    }

    return { tag, vr, value: displayValue };
  });

  return c.json({ success: true, data: tags });
});

// Get thumbnail
imagesRouter.get('/:id/thumbnail', async (c) => {
  const id = c.req.param('id');
  const image = await db.query.images.findFirst({
    where: eq(images.id, id),
  });

  if (!image?.thumbnailPath) throw new NotFoundError('缩略图');

  const thumbnailPath = join(process.cwd(), 'data', 'images', image.thumbnailPath);
  return serveFileOrFallback(thumbnailPath, 'image/jpeg', FALLBACK_THUMBNAILS);
});

// Delete image
imagesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const image = await db.query.images.findFirst({
    where: eq(images.id, id),
  });

  if (!image) throw new NotFoundError('图像');

  // Delete files
  const filePath = join(process.cwd(), 'data', 'images', image.filePath);
  await Bun.file(filePath).delete();

  if (image.thumbnailPath) {
    const thumbnailPath = join(process.cwd(), 'data', 'images', image.thumbnailPath);
    await Bun.file(thumbnailPath).delete();
  }

  // Delete record
  await db.delete(images).where(eq(images.id, id));

  // Update series image count
  await db.update(series)
    .set({ imageCount: sql`${series.imageCount} - 1` })
    .where(eq(series.id, image.seriesId));

  return c.json({ success: true, message: '图像已删除' });
});

// --- Image Pyramid endpoints ---

// GET /:id/pyramid/:level — Serve a specific pyramid level
imagesRouter.get('/:id/pyramid/:level', async (c) => {
  const id = c.req.param('id');
  const level = c.req.param('level') as PyramidLevel;

  const validLevels = ['256', '512', '1024', 'full'];
  if (!validLevels.includes(level)) {
    return c.json({ success: false, message: 'Invalid level. Use: 256, 512, 1024, full' }, 400);
  }

  // Generate pyramid lazily if not exists
  try {
    await generatePyramid(id);
  } catch (err) {
    console.error('Failed to generate pyramid:', err);
    throw new NotFoundError('图像');
  }

  const filePath = getPyramidFilePath(id, level);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new NotFoundError('金字塔层级');
  }

  return new Response(file, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// POST /:id/pyramid — Pre-generate all pyramid levels
imagesRouter.post('/:id/pyramid', async (c) => {
  const id = c.req.param('id');

  try {
    await generatePyramid(id);
    return c.json({ success: true, message: '金字塔生成完成' });
  } catch (err) {
    console.error('Failed to generate pyramid:', err);
    return c.json({ success: false, message: '生成失败' }, 500);
  }
});

// GET /:id/pyramid/best — Serve best pyramid level for given viewport
imagesRouter.get('/:id/pyramid/best', async (c) => {
  const id = c.req.param('id');
  const vw = Number(c.req.query('vw')) || 1024;
  const vh = Number(c.req.query('vh')) || 768;
  const zoom = Number(c.req.query('zoom')) || 1;

  const level = selectPyramidLevel(vw, vh, zoom);

  try {
    await generatePyramid(id);
  } catch {
    throw new NotFoundError('图像');
  }

  const filePath = getPyramidFilePath(id, level);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new NotFoundError('金字塔层级');
  }

  return new Response(file, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Pyramid-Level': level,
    },
  });
});

// --- Nested annotation routes (backward compatibility) ---

// GET /:id/annotations — Get annotations for this image
imagesRouter.get('/:id/annotations', async (c) => {
  const imageId = c.req.param('id');
  const results = await db.query.annotations.findMany({
    where: eq(annotations.imageId, imageId),
    with: { user: true },
  });
  return c.json({ success: true, data: results });
});

// POST /:id/annotations — Create annotation on this image
imagesRouter.post('/:id/annotations', async (c) => {
  const imageId = c.req.param('id');
  const body = await c.req.json();
  const userId = (c as any).get('userId') || body.userId;

  if (!userId) {
    return c.json({ success: false, message: '未认证' }, 401);
  }

  const id = uuid();
  const now = new Date().toISOString();

  await db.insert(annotations).values({
    id,
    imageId,
    studyId: body.studyId || null,
    userId,
    layerId: body.layerId || null,
    type: body.type,
    geometry: typeof body.geometry === 'string' ? body.geometry : JSON.stringify(body.geometry),
    style: typeof body.style === 'string' ? body.style : JSON.stringify(body.style),
    label: body.label || null,
    notes: body.notes || null,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.query.annotations.findFirst({
    where: eq(annotations.id, id),
    with: { user: true },
  });

  return c.json({ success: true, data: created }, 201);
});

// --- Nested layer routes (backward compatibility) ---

// GET /:id/layers — Get layers for this image
imagesRouter.get('/:id/layers', async (c) => {
  const imageId = c.req.param('id');
  const results = await db.query.layers.findMany({
    where: eq(layers.imageId, imageId),
  });
  return c.json({ success: true, data: results });
});

// POST /:id/layers — Create layer on this image
imagesRouter.post('/:id/layers', async (c) => {
  const imageId = c.req.param('id');
  const body = await c.req.json();

  if (!body.name || !body.type) {
    return c.json({ success: false, message: '缺少必填字段 (name, type)' }, 400);
  }
  // 撤销/重做 (#132): 级联删除的图层恢复时按原 id 重建, 保持 annotation
  // layerId 引用与前端快照一致 (可选字段, 默认仍生成 uuid)。
  if (body.id !== undefined && (typeof body.id !== 'string' || !body.id.trim())) {
    return c.json({ success: false, message: 'id 必须是字符串' }, 400);
  }

  const id = body.id || uuid();

  await db.insert(layers).values({
    id,
    imageId,
    name: body.name,
    type: body.type,
    visible: body.visible ?? true,
    opacity: body.opacity ?? 1,
    locked: body.locked ?? false,
    sortOrder: body.sortOrder ?? 0,
    createdAt: new Date().toISOString(),
  });

  const created = await db.query.layers.findFirst({
    where: eq(layers.id, id),
  });

  return c.json({ success: true, data: created }, 201);
});

export default imagesRouter;
