/**
 * Annotations route — supports both Image-level and Study-level annotations.
 *
 * Endpoints:
 *   GET    /                        - List annotations (filter by imageId or studyId)
 *   GET    /:id                     - Get annotation by ID
 *   POST   /                        - Create annotation (imageId or studyId required)
 *   PUT    /:id                     - Update annotation
 *   DELETE /:id                     - Delete annotation
 *   GET    /study/:studyId          - Get study-level annotations
 */

import { Hono } from 'hono';
import { eq, and, isNull } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db, annotations, insertAnnotationSchema } from '../db';

const annotationsRouter = new Hono();

// GET / — List annotations (filter by imageId or studyId)
annotationsRouter.get('/', async (c) => {
  const imageId = c.req.query('imageId');
  const studyId = c.req.query('studyId');

  let conditions;
  if (imageId) {
    conditions = eq(annotations.imageId, imageId);
  } else if (studyId) {
    conditions = eq(annotations.studyId, studyId);
  } else {
    // Return all annotations (paginated)
    const results = await db.query.annotations.findMany({
      with: { user: true, image: true, study: true },
      limit: 100,
    });
    return c.json({ success: true, data: results });
  }

  const results = await db.query.annotations.findMany({
    where: conditions,
    with: { user: true, image: true, study: true },
  });

  return c.json({ success: true, data: results });
});

// GET /study/:studyId — Get only study-level annotations (imageId is null)
annotationsRouter.get('/study/:studyId', async (c) => {
  const studyId = c.req.param('studyId');
  const results = await db.query.annotations.findMany({
    where: and(eq(annotations.studyId, studyId), isNull(annotations.imageId)),
    with: { user: true, study: true },
  });
  return c.json({ success: true, data: results });
});

// GET /:id — Get annotation by ID
annotationsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.query.annotations.findFirst({
    where: eq(annotations.id, id),
    with: { user: true, image: true, study: true },
  });

  if (!result) {
    return c.json({ success: false, message: '标注未找到' }, 404);
  }

  return c.json({ success: true, data: result });
});

// POST / — Create annotation (imageId or studyId must be provided)
annotationsRouter.post('/', async (c) => {
  const body = await c.req.json();

  // Validate: at least one of imageId or studyId must be present
  if (!body.imageId && !body.studyId) {
    return c.json({ success: false, message: '必须指定 imageId 或 studyId' }, 400);
  }

  // Get user ID from auth context
  const userId = (c as any).get('userId') || body.userId;
  if (!userId) {
    return c.json({ success: false, message: '未认证' }, 401);
  }

  const id = uuid();
  const now = new Date().toISOString();

  const data = {
    id,
    imageId: body.imageId || null,
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
  };

  await db.insert(annotations).values(data);

  const created = await db.query.annotations.findFirst({
    where: eq(annotations.id, id),
    with: { user: true, image: true, study: true },
  });

  return c.json({ success: true, data: created }, 201);
});

// PUT /:id — Update annotation
annotationsRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await db.query.annotations.findFirst({
    where: eq(annotations.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: '标注未找到' }, 404);
  }

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.type !== undefined) updates.type = body.type;
  if (body.geometry !== undefined) {
    updates.geometry = typeof body.geometry === 'string' ? body.geometry : JSON.stringify(body.geometry);
  }
  if (body.style !== undefined) {
    updates.style = typeof body.style === 'string' ? body.style : JSON.stringify(body.style);
  }
  if (body.label !== undefined) updates.label = body.label;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.layerId !== undefined) updates.layerId = body.layerId;

  await db.update(annotations).set(updates).where(eq(annotations.id, id));

  const updated = await db.query.annotations.findFirst({
    where: eq(annotations.id, id),
    with: { user: true, image: true, study: true },
  });

  return c.json({ success: true, data: updated });
});

// DELETE /:id — Delete annotation
annotationsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');

  const existing = await db.query.annotations.findFirst({
    where: eq(annotations.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: '标注未找到' }, 404);
  }

  await db.delete(annotations).where(eq(annotations.id, id));

  return c.json({ success: true, message: '标注已删除' });
});

export default annotationsRouter;
