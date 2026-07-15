import { Hono } from 'hono';
import { z } from 'zod';
import { db, images, series } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const imagesRouter = new Hono();

// Upload image
imagesRouter.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const seriesId = formData.get('seriesId') as string;
    const instanceNumber = Number(formData.get('instanceNumber')) || 1;

    if (!file) {
      return c.json({ success: false, message: '请选择文件' }, 400);
    }

    // Create upload directory
    const uploadDir = join(process.cwd(), 'data', 'images');
    await mkdir(uploadDir, { recursive: true });

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const filename = `${uuid()}.${ext}`;
    const filePath = join(uploadDir, filename);

    // Save file
    const buffer = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(buffer));

    // Create image record
    const id = uuid();
    await db.insert(images).values({
      id,
      seriesId,
      instanceNumber,
      filePath: filename,
      fileSize: file.size,
      fileHash: '', // TODO: calculate hash
      format: ext as any,
      width: 0, // TODO: get from image
      height: 0, // TODO: get from image
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
  } catch (error) {
    console.error('Upload image error:', error);
    return c.json({ success: false, message: '上传失败' }, 500);
  }
});

// Get image by ID
imagesRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const image = await db.query.images.findFirst({
      where: eq(images.id, id),
    });

    if (!image) {
      return c.json({ success: false, message: '图像未找到' }, 404);
    }

    return c.json({ success: true, data: image });
  } catch (error) {
    console.error('Get image error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Get image file
imagesRouter.get('/:id/file', async (c) => {
  try {
    const id = c.req.param('id');
    const image = await db.query.images.findFirst({
      where: eq(images.id, id),
    });

    if (!image) {
      return c.json({ success: false, message: '图像未找到' }, 404);
    }

    const filePath = join(process.cwd(), 'data', 'images', image.filePath);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return c.json({ success: false, message: '文件不存在' }, 404);
    }

    return new Response(file, {
      headers: {
        'Content-Type': `image/${image.format}`,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Get image file error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Delete image
imagesRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const image = await db.query.images.findFirst({
      where: eq(images.id, id),
    });

    if (!image) {
      return c.json({ success: false, message: '图像未找到' }, 404);
    }

    // Delete file
    const filePath = join(process.cwd(), 'data', 'images', image.filePath);
    await Bun.file(filePath).delete();

    // Delete record
    await db.delete(images).where(eq(images.id, id));

    // Update series image count
    await db.update(series)
      .set({ imageCount: sql`${series.imageCount} - 1` })
      .where(eq(series.id, image.seriesId));

    return c.json({ success: true, message: '图像已删除' });
  } catch (error) {
    console.error('Delete image error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Search images
imagesRouter.get('/search', async (c) => {
  try {
    const seriesId = c.req.query('seriesId');
    if (!seriesId) {
      return c.json({ success: true, data: [] });
    }

    const allImages = await db.query.images.findMany({
      where: eq(images.seriesId, seriesId),
      orderBy: (images, { asc }) => [asc(images.instanceNumber)],
    });

    return c.json({ success: true, data: allImages });
  } catch (error) {
    console.error('Search images error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

export default imagesRouter;
