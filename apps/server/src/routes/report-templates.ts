import { Hono } from 'hono';
import { z } from 'zod';
import { db, reportTemplates } from '../db';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

const reportTemplatesRouter = new Hono();

// Get all templates
reportTemplatesRouter.get('/', async (c) => {
  try {
    const allTemplates = await db.query.reportTemplates.findMany({
      orderBy: (reportTemplates, { asc }) => [asc(reportTemplates.name)],
    });

    return c.json({ success: true, data: allTemplates });
  } catch (error) {
    console.error('Get templates error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Get template by ID
reportTemplatesRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const template = await db.query.reportTemplates.findFirst({
      where: eq(reportTemplates.id, id),
    });

    if (!template) {
      return c.json({ success: false, message: '模板未找到' }, 404);
    }

    return c.json({ success: true, data: template });
  } catch (error) {
    console.error('Get template error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Create template
reportTemplatesRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const id = uuid();

    await db.insert(reportTemplates).values({
      id,
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const template = await db.query.reportTemplates.findFirst({
      where: eq(reportTemplates.id, id),
    });

    return c.json({ success: true, data: template }, 201);
  } catch (error) {
    console.error('Create template error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Update template
reportTemplatesRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    await db.update(reportTemplates)
      .set({
        ...body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(reportTemplates.id, id));

    const template = await db.query.reportTemplates.findFirst({
      where: eq(reportTemplates.id, id),
    });

    return c.json({ success: true, data: template });
  } catch (error) {
    console.error('Update template error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Delete template
reportTemplatesRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await db.delete(reportTemplates).where(eq(reportTemplates.id, id));
    return c.json({ success: true, message: '模板已删除' });
  } catch (error) {
    console.error('Delete template error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

export default reportTemplatesRouter;
