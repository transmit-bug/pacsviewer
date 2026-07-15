import { Hono } from 'hono';
import { z } from 'zod';
import { db, studies, series, images } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

const studiesRouter = new Hono();

// Get all studies
studiesRouter.get('/', async (c) => {
  try {
    const page = Number(c.req.query('page')) || 1;
    const pageSize = Number(c.req.query('pageSize')) || 20;
    const patientId = c.req.query('patientId');
    const offset = (page - 1) * pageSize;

    let where = undefined;
    if (patientId) {
      where = eq(studies.patientId, patientId);
    }

    const allStudies = await db.query.studies.findMany({
      where,
      limit: pageSize,
      offset,
      orderBy: (studies, { desc }) => [desc(studies.studyDate)],
      with: {
        patient: true,
        physician: true,
      },
    });

    const count = await db.select({ count: sql<number>`count(*)` }).from(studies).where(where);

    return c.json({
      success: true,
      data: {
        items: allStudies,
        total: count[0].count,
        page,
        pageSize,
        totalPages: Math.ceil(count[0].count / pageSize),
      },
    });
  } catch (error) {
    console.error('Get studies error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Get study by ID
studiesRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const study = await db.query.studies.findFirst({
      where: eq(studies.id, id),
      with: {
        patient: true,
        physician: true,
      },
    });

    if (!study) {
      return c.json({ success: false, message: '检查未找到' }, 404);
    }

    return c.json({ success: true, data: study });
  } catch (error) {
    console.error('Get study error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Create study
studiesRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const id = uuid();

    await db.insert(studies).values({
      id,
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const study = await db.query.studies.findFirst({
      where: eq(studies.id, id),
    });

    return c.json({ success: true, data: study }, 201);
  } catch (error) {
    console.error('Create study error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Update study
studiesRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    await db.update(studies)
      .set({
        ...body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(studies.id, id));

    const study = await db.query.studies.findFirst({
      where: eq(studies.id, id),
    });

    return c.json({ success: true, data: study });
  } catch (error) {
    console.error('Update study error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Delete study
studiesRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await db.delete(studies).where(eq(studies.id, id));
    return c.json({ success: true, message: '检查已删除' });
  } catch (error) {
    console.error('Delete study error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Update study status
studiesRouter.put('/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    await db.update(studies)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(studies.id, id));

    return c.json({ success: true, message: '状态已更新' });
  } catch (error) {
    console.error('Update study status error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Get study series
studiesRouter.get('/:id/series', async (c) => {
  try {
    const id = c.req.param('id');
    const studySeries = await db.query.series.findMany({
      where: eq(series.studyId, id),
      orderBy: (series, { asc }) => [asc(series.seriesNumber)],
    });

    return c.json({ success: true, data: studySeries });
  } catch (error) {
    console.error('Get study series error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

export default studiesRouter;
