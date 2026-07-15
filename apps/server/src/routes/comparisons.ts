import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { comparisons, insertComparisonSchema } from '../db/schema';
import { NotFoundError, ValidationError } from '../lib/errors';
import { promises as fs } from 'fs';
import path from 'path';

type Variables = {
  user: { id: string; role?: { name: string } };
};

const comparisonsRouter = new Hono<{ Variables: Variables }>();

// GET / - List comparisons with optional filters
comparisonsRouter.get('/', async (c) => {
  const user = c.get('user');
  const patientId = c.req.query('patientId');
  const isFavorite = c.req.query('isFavorite');

  const conditions = [eq(comparisons.createdBy, user.id)];
  if (patientId) {
    conditions.push(eq(comparisons.patientId, patientId));
  }
  if (isFavorite !== undefined) {
    conditions.push(eq(comparisons.isFavorite, isFavorite === 'true'));
  }

  const items = await db.query.comparisons.findMany({
    where: and(...conditions),
    orderBy: [desc(comparisons.updatedAt)],
  });

  return c.json({ success: true, data: items });
});

// GET /favorites - List favorite comparisons
comparisonsRouter.get('/favorites', async (c) => {
  const user = c.get('user');

  const items = await db.query.comparisons.findMany({
    where: and(
      eq(comparisons.createdBy, user.id),
      eq(comparisons.isFavorite, true),
    ),
    orderBy: [desc(comparisons.updatedAt)],
  });

  return c.json({ success: true, data: items });
});

// GET /:id - Get single comparison
comparisonsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const item = await db.query.comparisons.findFirst({
    where: and(
      eq(comparisons.id, id),
      eq(comparisons.createdBy, user.id),
    ),
  });

  if (!item) throw new NotFoundError('对比');

  return c.json({ success: true, data: item });
});

// POST / - Create comparison
comparisonsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  if (!body.name || !body.type || !body.config) {
    throw new ValidationError('缺少必填字段: name, type, config');
  }

  const validTypes = ['side_by_side', 'overlay', 'slider'];
  if (!validTypes.includes(body.type)) {
    throw new ValidationError(`无效的对比类型。支持: ${validTypes.join(', ')}`);
  }

  const id = uuid();
  const now = new Date().toISOString();

  await db.insert(comparisons).values({
    id,
    patientId: body.patientId || null,
    name: body.name,
    type: body.type,
    config: body.config,
    imageIds: body.imageIds || [],
    isFavorite: body.isFavorite || false,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  });

  const item = await db.query.comparisons.findFirst({
    where: eq(comparisons.id, id),
  });

  return c.json({ success: true, data: item }, 201);
});

// PUT /:id - Update comparison
comparisonsRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json();

  const existing = await db.query.comparisons.findFirst({
    where: and(
      eq(comparisons.id, id),
      eq(comparisons.createdBy, user.id),
    ),
  });

  if (!existing) throw new NotFoundError('对比');

  await db
    .update(comparisons)
    .set({
      ...body,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(comparisons.id, id));

  const item = await db.query.comparisons.findFirst({
    where: eq(comparisons.id, id),
  });

  return c.json({ success: true, data: item });
});

// DELETE /:id - Delete comparison
comparisonsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const existing = await db.query.comparisons.findFirst({
    where: and(
      eq(comparisons.id, id),
      eq(comparisons.createdBy, user.id),
    ),
  });

  if (!existing) throw new NotFoundError('对比');

  // Delete snapshot file if exists
  if (existing.snapshotPath) {
    try {
      await fs.unlink(existing.snapshotPath);
    } catch {
      // File might not exist, ignore
    }
  }

  await db.delete(comparisons).where(eq(comparisons.id, id));

  return c.json({ success: true, message: '对比已删除' });
});

// PUT /:id/favorite - Toggle favorite status
comparisonsRouter.put('/:id/favorite', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const existing = await db.query.comparisons.findFirst({
    where: and(
      eq(comparisons.id, id),
      eq(comparisons.createdBy, user.id),
    ),
  });

  if (!existing) throw new NotFoundError('对比');

  const newFavorite = !existing.isFavorite;

  await db
    .update(comparisons)
    .set({
      isFavorite: newFavorite,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(comparisons.id, id));

  return c.json({
    success: true,
    data: { isFavorite: newFavorite },
    message: newFavorite ? '已添加到收藏' : '已取消收藏',
  });
});

// POST /:id/snapshot - Save snapshot (base64 PNG)
comparisonsRouter.post('/:id/snapshot', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json();

  if (!body.image) {
    throw new ValidationError('缺少 image 字段 (base64 PNG)');
  }

  const existing = await db.query.comparisons.findFirst({
    where: and(
      eq(comparisons.id, id),
      eq(comparisons.createdBy, user.id),
    ),
  });

  if (!existing) throw new NotFoundError('对比');

  // Save base64 image to file
  const base64Data = body.image.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const snapshotDir = path.join(process.cwd(), 'data', 'snapshots');
  await fs.mkdir(snapshotDir, { recursive: true });

  const filename = `comparison-${id}-${Date.now()}.png`;
  const filePath = path.join(snapshotDir, filename);

  await fs.writeFile(filePath, buffer);

  // Update comparison with snapshot path
  await db
    .update(comparisons)
    .set({
      snapshotPath: filePath,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(comparisons.id, id));

  return c.json({
    success: true,
    data: { snapshotPath: filePath },
    message: '快照已保存',
  });
});

// GET /:id/snapshot - Get snapshot file
comparisonsRouter.get('/:id/snapshot', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const existing = await db.query.comparisons.findFirst({
    where: and(
      eq(comparisons.id, id),
      eq(comparisons.createdBy, user.id),
    ),
  });

  if (!existing) throw new NotFoundError('对比');
  if (!existing.snapshotPath) {
    throw new NotFoundError('快照');
  }

  try {
    const buffer = await fs.readFile(existing.snapshotPath);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    throw new NotFoundError('快照文件');
  }
});

export default comparisonsRouter;
