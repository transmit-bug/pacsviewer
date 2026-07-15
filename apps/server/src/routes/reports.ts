import { Hono } from 'hono';
import { z } from 'zod';
import { db, reports, reportTemplates } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

const reportsRouter = new Hono();

// Get all reports
reportsRouter.get('/', async (c) => {
  try {
    const page = Number(c.req.query('page')) || 1;
    const pageSize = Number(c.req.query('pageSize')) || 20;
    const studyId = c.req.query('studyId');
    const offset = (page - 1) * pageSize;

    let where = undefined;
    if (studyId) {
      where = eq(reports.studyId, studyId);
    }

    const allReports = await db.query.reports.findMany({
      where,
      limit: pageSize,
      offset,
      orderBy: (reports, { desc }) => [desc(reports.createdAt)],
    });

    const count = await db.select({ count: sql<number>`count(*)` }).from(reports).where(where);

    return c.json({
      success: true,
      data: {
        items: allReports,
        total: count[0].count,
        page,
        pageSize,
        totalPages: Math.ceil(count[0].count / pageSize),
      },
    });
  } catch (error) {
    console.error('Get reports error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Get report by ID
reportsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const report = await db.query.reports.findFirst({
      where: eq(reports.id, id),
    });

    if (!report) {
      return c.json({ success: false, message: '报告未找到' }, 404);
    }

    return c.json({ success: true, data: report });
  } catch (error) {
    console.error('Get report error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Create report
reportsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const id = uuid();

    await db.insert(reports).values({
      id,
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const report = await db.query.reports.findFirst({
      where: eq(reports.id, id),
    });

    return c.json({ success: true, data: report }, 201);
  } catch (error) {
    console.error('Create report error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Update report
reportsRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    await db.update(reports)
      .set({
        ...body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(reports.id, id));

    const report = await db.query.reports.findFirst({
      where: eq(reports.id, id),
    });

    return c.json({ success: true, data: report });
  } catch (error) {
    console.error('Update report error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Delete report
reportsRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await db.delete(reports).where(eq(reports.id, id));
    return c.json({ success: true, message: '报告已删除' });
  } catch (error) {
    console.error('Delete report error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Update report status
reportsRouter.put('/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    await db.update(reports)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(reports.id, id));

    return c.json({ success: true, message: '状态已更新' });
  } catch (error) {
    console.error('Update report status error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

export default reportsRouter;
