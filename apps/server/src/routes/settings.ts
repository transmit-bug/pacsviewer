/**
 * System Settings route — configuration management.
 *
 * Endpoints:
 *   GET    /               - List all settings (or filter by category)
 *   GET    /:category/:key - Get specific setting
 *   PUT    /:category/:key - Update/create setting
 *   DELETE /:category/:key - Delete setting
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db, systemSettings } from '../db';

const settingsRouter = new Hono();

// GET / — List settings (optional category filter)
settingsRouter.get('/', async (c) => {
  const category = c.req.query('category');

  if (category) {
    const results = await db.query.systemSettings.findMany({
      where: eq(systemSettings.category, category),
    });
    return c.json({ success: true, data: results });
  }

  const results = await db.query.systemSettings.findMany();
  return c.json({ success: true, data: results });
});

// GET /:category/:key — Get specific setting
settingsRouter.get('/:category/:key', async (c) => {
  const { category, key } = c.req.param();

  const result = await db.query.systemSettings.findFirst({
    where: and(
      eq(systemSettings.category, category),
      eq(systemSettings.key, key),
    ),
  });

  if (!result) {
    return c.json({ success: false, message: '设置未找到' }, 404);
  }

  return c.json({ success: true, data: result });
});

// PUT /:category/:key — Create or update setting
settingsRouter.put('/:category/:key', async (c) => {
  const { category, key } = c.req.param();
  const body = await c.req.json();

  const existing = await db.query.systemSettings.findFirst({
    where: and(
      eq(systemSettings.category, category),
      eq(systemSettings.key, key),
    ),
  });

  if (existing) {
    await db.update(systemSettings)
      .set({
        value: body.value,
        description: body.description ?? existing.description,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(systemSettings.id, existing.id));
  } else {
    await db.insert(systemSettings).values({
      id: uuid(),
      category,
      key,
      value: body.value,
      description: body.description || null,
      updatedAt: new Date().toISOString(),
    });
  }

  const updated = await db.query.systemSettings.findFirst({
    where: and(
      eq(systemSettings.category, category),
      eq(systemSettings.key, key),
    ),
  });

  return c.json({ success: true, data: updated });
});

// DELETE /:category/:key — Delete setting
settingsRouter.delete('/:category/:key', async (c) => {
  const { category, key } = c.req.param();

  await db.delete(systemSettings).where(
    and(
      eq(systemSettings.category, category),
      eq(systemSettings.key, key),
    ),
  );

  return c.json({ success: true, message: '设置已删除' });
});

export default settingsRouter;
