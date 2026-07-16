/**
 * Layers route — manages image layers for the viewer/editor.
 *
 * Endpoints:
 *   GET    /              - List layers (filter by imageId)
 *   GET    /:id           - Get layer by ID
 *   POST   /              - Create layer
 *   PUT    /:id           - Update layer
 *   DELETE /:id           - Delete layer
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db, layers } from '../db';

const layersRouter = new Hono();

// GET / — List layers
layersRouter.get('/', async (c) => {
  const imageId = c.req.query('imageId');

  if (imageId) {
    const results = await db.query.layers.findMany({
      where: eq(layers.imageId, imageId),
    });
    return c.json({ success: true, data: results });
  }

  const results = await db.query.layers.findMany({ limit: 100 });
  return c.json({ success: true, data: results });
});

// GET /:id — Get layer by ID
layersRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.query.layers.findFirst({
    where: eq(layers.id, id),
  });

  if (!result) {
    return c.json({ success: false, message: '图层未找到' }, 404);
  }

  return c.json({ success: true, data: result });
});

// POST / — Create layer
layersRouter.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.imageId || !body.name || !body.type) {
    return c.json({ success: false, message: '缺少必填字段 (imageId, name, type)' }, 400);
  }

  const id = uuid();
  const now = new Date().toISOString();

  await db.insert(layers).values({
    id,
    imageId: body.imageId,
    name: body.name,
    type: body.type,
    visible: body.visible ?? true,
    opacity: body.opacity ?? 1,
    locked: body.locked ?? false,
    sortOrder: body.sortOrder ?? 0,
    createdAt: now,
  });

  const created = await db.query.layers.findFirst({
    where: eq(layers.id, id),
  });

  return c.json({ success: true, data: created }, 201);
});

// PUT /:id — Update layer
layersRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await db.query.layers.findFirst({
    where: eq(layers.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: '图层未找到' }, 404);
  }

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if (body.visible !== undefined) updates.visible = body.visible;
  if (body.opacity !== undefined) updates.opacity = body.opacity;
  if (body.locked !== undefined) updates.locked = body.locked;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  if (Object.keys(updates).length > 0) {
    await db.update(layers).set(updates).where(eq(layers.id, id));
  }

  const updated = await db.query.layers.findFirst({
    where: eq(layers.id, id),
  });

  return c.json({ success: true, data: updated });
});

// DELETE /:id — Delete layer
layersRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');

  const existing = await db.query.layers.findFirst({
    where: eq(layers.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: '图层未找到' }, 404);
  }

  await db.delete(layers).where(eq(layers.id, id));

  return c.json({ success: true, message: '图层已删除' });
});

export default layersRouter;
