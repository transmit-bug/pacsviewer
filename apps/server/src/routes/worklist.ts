/**
 * Worklist API Routes
 *
 * Manages DICOM Modality Worklist items for scheduling procedures.
 * These items are returned to DICOM devices via C-FIND SCP.
 *
 * Endpoints:
 *   GET /              - List worklist items with filtering
 *   POST /             - Create a new worklist item
 *   GET /:id           - Get a specific worklist item
 *   PUT /:id           - Update a worklist item
 *   DELETE /:id        - Delete a worklist item
 */

import { Hono } from 'hono';
import { eq, and, gte, lte, like, desc } from 'drizzle-orm';
import { db, worklistItems, patients, insertWorklistItemSchema } from '../db';
import { NotFoundError, ValidationError } from '../lib/errors';
import { log } from '../lib/audit';
import { AuditEvents } from '../lib/audit-events';
import { v4 as uuid } from 'uuid';

const worklistRouter = new Hono();

// GET / — List worklist items with filtering
worklistRouter.get('/', async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 50));
  const offset = (page - 1) * pageSize;

  // Filter parameters
  const modality = c.req.query('modality');
  const status = c.req.query('status');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const patientName = c.req.query('patientName');

  // Build where conditions
  const conditions = [];
  if (modality) {
    conditions.push(eq(worklistItems.modality, modality));
  }
  if (status) {
    conditions.push(eq(worklistItems.status, status as any));
  }
  if (startDate) {
    conditions.push(gte(worklistItems.scheduledProcedureStepStartDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(worklistItems.scheduledProcedureStepStartDate, endDate));
  }
  if (patientName) {
    conditions.push(like(worklistItems.patientName, `%${patientName}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Query items
  const items = await db.query.worklistItems.findMany({
    where,
    with: { patient: true },
    orderBy: [desc(worklistItems.scheduledProcedureStepStartDate)],
    limit: pageSize,
    offset,
  });

  // Count total
  const countResult = await db
    .select({ count: worklistItems.id })
    .from(worklistItems)
    .where(where);

  return c.json({
    success: true,
    data: {
      items,
      total: countResult.length,
      page,
      pageSize,
      totalPages: Math.ceil(countResult.length / pageSize),
    },
  });
});

// POST / — Create a new worklist item
worklistRouter.post('/', async (c) => {
  const body = await c.req.json();

  // Validate required fields
  if (!body.patientName || !body.accessionNumber || !body.modality || !body.scheduledProcedureStepStartDate) {
    throw new ValidationError('Missing required fields: patientName, accessionNumber, modality, scheduledProcedureStepStartDate');
  }

  const id = uuid();
  const userId = (c as any).get('userId') || 'system';

  await db.insert(worklistItems).values({
    id,
    patientId: body.patientId || null,
    patientName: body.patientName,
    patientBirthDate: body.patientBirthDate || null,
    patientSex: body.patientSex || null,
    accessionNumber: body.accessionNumber,
    scheduledProcedureStepId: body.scheduledProcedureStepId || null,
    modality: body.modality,
    scheduledStationName: body.scheduledStationName || null,
    scheduledProcedureStepStartDate: body.scheduledProcedureStepStartDate,
    scheduledProcedureStepStartTime: body.scheduledProcedureStepStartTime || null,
    requestedProcedureDescription: body.requestedProcedureDescription || null,
    referringPhysicianName: body.referringPhysicianName || null,
    status: body.status || 'scheduled',
  });

  // Audit log
  log({
    userId,
    action: AuditEvents.WORKLIST_CREATE,
    resource: 'worklist',
    resourceId: id,
    details: { patientName: body.patientName, modality: body.modality },
  });

  return c.json({ success: true, data: { id } }, 201);
});

// GET /:id — Get a specific worklist item
worklistRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  const item = await db.query.worklistItems.findFirst({
    where: eq(worklistItems.id, id),
    with: { patient: true },
  });

  if (!item) {
    throw new NotFoundError('Worklist item');
  }

  return c.json({ success: true, data: item });
});

// PUT /:id — Update a worklist item
worklistRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const userId = (c as any).get('userId') || 'system';

  // Check if item exists
  const existing = await db.query.worklistItems.findFirst({
    where: eq(worklistItems.id, id),
  });

  if (!existing) {
    throw new NotFoundError('Worklist item');
  }

  // Update item
  await db.update(worklistItems)
    .set({
      ...body,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(worklistItems.id, id));

  // Audit log
  log({
    userId,
    action: AuditEvents.WORKLIST_UPDATE,
    resource: 'worklist',
    resourceId: id,
    details: { changes: body },
  });

  return c.json({ success: true, message: '已更新' });
});

// DELETE /:id — Delete a worklist item
worklistRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const userId = (c as any).get('userId') || 'system';

  // Check if item exists
  const existing = await db.query.worklistItems.findFirst({
    where: eq(worklistItems.id, id),
  });

  if (!existing) {
    throw new NotFoundError('Worklist item');
  }

  // Delete item
  await db.delete(worklistItems).where(eq(worklistItems.id, id));

  // Audit log
  log({
    userId,
    action: AuditEvents.WORKLIST_DELETE,
    resource: 'worklist',
    resourceId: id,
  });

  return c.json({ success: true, message: '已删除' });
});

export default worklistRouter;
