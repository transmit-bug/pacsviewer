import { Hono } from 'hono';
import { z } from 'zod';
import { db, patients, patientTags } from '../db';
import { eq, like, or, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

const patientsRouter = new Hono();

// Get all patients
patientsRouter.get('/', async (c) => {
  try {
    const page = Number(c.req.query('page')) || 1;
    const pageSize = Number(c.req.query('pageSize')) || 20;
    const offset = (page - 1) * pageSize;

    const allPatients = await db.query.patients.findMany({
      limit: pageSize,
      offset,
      orderBy: (patients, { desc }) => [desc(patients.createdAt)],
    });

    const count = await db.select({ count: sql<number>`count(*)` }).from(patients);

    return c.json({
      success: true,
      data: {
        items: allPatients,
        total: count[0].count,
        page,
        pageSize,
        totalPages: Math.ceil(count[0].count / pageSize),
      },
    });
  } catch (error) {
    console.error('Get patients error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Search patients
patientsRouter.get('/search', async (c) => {
  try {
    const query = c.req.query('q');
    if (!query) {
      return c.json({ success: true, data: [] });
    }

    const results = await db.query.patients.findMany({
      where: or(
        like(patients.name, `%${query}%`),
        like(patients.mrn, `%${query}%`),
        like(patients.phone, `%${query}%`)
      ),
      limit: 50,
    });

    return c.json({ success: true, data: results });
  } catch (error) {
    console.error('Search patients error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Get patient by ID
patientsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const patient = await db.query.patients.findFirst({
      where: eq(patients.id, id),
    });

    if (!patient) {
      return c.json({ success: false, message: '患者未找到' }, 404);
    }

    return c.json({ success: true, data: patient });
  } catch (error) {
    console.error('Get patient error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Create patient
patientsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const id = uuid();

    await db.insert(patients).values({
      id,
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const patient = await db.query.patients.findFirst({
      where: eq(patients.id, id),
    });

    return c.json({ success: true, data: patient }, 201);
  } catch (error) {
    console.error('Create patient error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Update patient
patientsRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    await db.update(patients)
      .set({
        ...body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(patients.id, id));

    const patient = await db.query.patients.findFirst({
      where: eq(patients.id, id),
    });

    return c.json({ success: true, data: patient });
  } catch (error) {
    console.error('Update patient error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Delete patient
patientsRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await db.delete(patients).where(eq(patients.id, id));
    return c.json({ success: true, message: '患者已删除' });
  } catch (error) {
    console.error('Delete patient error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Get patient studies
patientsRouter.get('/:id/studies', async (c) => {
  try {
    const id = c.req.param('id');
    const studies = await db.query.studies.findMany({
      where: (studies, { eq }) => eq(studies.patientId, id),
      orderBy: (studies, { desc }) => [desc(studies.studyDate)],
    });

    return c.json({ success: true, data: studies });
  } catch (error) {
    console.error('Get patient studies error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

export default patientsRouter;
