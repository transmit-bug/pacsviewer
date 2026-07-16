/**
 * Images route - Uses image processing module for metadata extraction.
 */

import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { db, images, series, annotations, layers } from '../db';
import { processImage } from '@pacsviewer/image-processing';
import { NotFoundError, ValidationError } from '../lib/errors';
import { generatePyramid, getPyramidFilePath, selectPyramidLevel, type PyramidLevel } from '../services/pyramid';

const imagesRouter = new Hono();

// Upload image
imagesRouter.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  const seriesId = formData.get('seriesId') as string;
  const instanceNumber = Number(formData.get('instanceNumber')) || 1;

  if (!file) throw new ValidationError('请选择文件');

  // Create upload directory
  const uploadDir = join(process.cwd(), 'data', 'images');
  await mkdir(uploadDir, { recursive: true });

  // Process image
  const buffer = Buffer.from(await file.arrayBuffer());
  const { hash, metadata, thumbnail } = await processImage(buffer, file.name);

  // Generate unique filename
  const ext = file.name.split('.').pop();
  const filename = `${uuid()}.${ext}`;
  const filePath = join(uploadDir, filename);
  const thumbnailFilename = `${uuid()}-thumb.jpeg`;
  const thumbnailPath = join(uploadDir, thumbnailFilename);

  // Save files
  await Promise.all([
    writeFile(filePath, buffer),
    writeFile(thumbnailPath, thumbnail),
  ]);

  // Create image record
  const id = uuid();
  await db.insert(images).values({
    id,
    seriesId,
    instanceNumber,
    filePath: filename,
    fileSize: file.size,
    fileHash: hash,
    format: ext as any,
    width: metadata.width,
    height: metadata.height,
    bitsAllocated: metadata.bitsPerSample ?? 8,
    thumbnailPath: thumbnailFilename,
    createdAt: new Date().toISOString(),
  });

  // Update series image count
  await db.update(series)
    .set({ imageCount: sql`${series.imageCount} + 1` })
    .where(eq(series.id, seriesId));

  const image = await db.query.images.findFirst({
    where: eq(images.id, id),
  });

  return c.json({ success: true, data: image }, 201);
});

// Get image by ID
imagesRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const image = await db.query.images.findFirst({
    where: eq(images.id, id),
  });

  if (!image) throw new NotFoundError('图像');

  return c.json({ success: true, data: image });
});

// Get image file
imagesRouter.get('/:id/file', async (c) => {
  const id = c.req.param('id');
  const image = await db.query.images.findFirst({
    where: eq(images.id, id),
  });

  if (!image) throw new NotFoundError('图像');

  const filePath = join(process.cwd(), 'data', 'images', image.filePath);
  const file = Bun.file(filePath);

  if (!(await file.exists())) throw new NotFoundError('文件');

  return new Response(file, {
    headers: {
      'Content-Type': `image/${image.format}`,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
});

// Get thumbnail
imagesRouter.get('/:id/thumbnail', async (c) => {
  const id = c.req.param('id');
  const image = await db.query.images.findFirst({
    where: eq(images.id, id),
  });

  if (!image?.thumbnailPath) throw new NotFoundError('缩略图');

  const thumbnailPath = join(process.cwd(), 'data', 'images', image.thumbnailPath);
  const file = Bun.file(thumbnailPath);

  if (!(await file.exists())) throw new NotFoundError('缩略图文件');

  return new Response(file, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
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

// Search images by series
imagesRouter.get('/search', async (c) => {
  const seriesId = c.req.query('seriesId');
  if (!seriesId) {
    return c.json({ success: true, data: [] });
  }

  const allImages = await db.query.images.findMany({
    where: eq(images.seriesId, seriesId),
    orderBy: (i, { asc }) => [asc(i.instanceNumber)],
  });

  return c.json({ success: true, data: allImages });
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

  const id = uuid();

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
