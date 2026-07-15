/**
 * Images route - Uses image processing module for metadata extraction.
 */

import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { db, images, series } from '../db';
import { processImage } from '@pacsviewer/image-processing';
import { NotFoundError, ValidationError } from '../lib/errors';

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

export default imagesRouter;
