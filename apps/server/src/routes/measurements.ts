/**
 * Measurement Routes — controlled dictionary + longitudinal snapshots (T2).
 *
 * Endpoints:
 *   GET    /definitions          - List measurement dictionary (presets ensured)
 *   GET    /definitions/:key     - Single definition
 *   POST   /definitions          - Create a custom definition
 *   PUT    /definitions/:key     - Update a definition
 *   DELETE /definitions/:key     - Delete a definition
 *   GET    /trends               - Longitudinal series for a patient, keyed by
 *                                  (measurement_key, studyDate)
 */
import { Hono } from 'hono';
import { eq, asc, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import {
  db,
  measurementDefinitions,
  measurementPoints,
  studies,
  insertMeasurementDefinitionSchema,
} from '../db';
import { ensurePresetDefinitions } from '../db/measurement-definitions';
import { NotFoundError, ValidationError } from '../lib/errors';
import { log } from '../lib/audit';
import { AuditEvents } from '../lib/audit-events';

const measurementsRouter = new Hono();

function parseDefinitionBody(body: Record<string, any>) {
  const parsed = insertMeasurementDefinitionSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || '定义字段不合法');
  }
  const data = parsed.data;
  const range = data.referenceRange ?? null;
  if (range !== null) {
    const { min, max } = range as { min?: number; max?: number };
    if (min !== undefined && max !== undefined && min > max) {
      throw new ValidationError('referenceRange.min 不能大于 max');
    }
  }
  return { ...data, referenceRange: range };
}

// GET /definitions — list dictionary (ensure presets exist first)
measurementsRouter.get('/definitions', async (c) => {
  await ensurePresetDefinitions();
  const items = await db.query.measurementDefinitions.findMany({
    orderBy: [asc(measurementDefinitions.key)],
  });
  return c.json({ success: true, data: items });
});

// GET /definitions/:key — single definition
measurementsRouter.get('/definitions/:key', async (c) => {
  const key = c.req.param('key');
  await ensurePresetDefinitions();
  const item = await db.query.measurementDefinitions.findFirst({
    where: eq(measurementDefinitions.key, key),
  });
  if (!item) throw new NotFoundError('测量定义');
  return c.json({ success: true, data: item });
});

// POST /definitions — create custom definition
measurementsRouter.post('/definitions', async (c) => {
  const body = await c.req.json();
  const userId = (c as any).get('userId') || 'system';
  const data = parseDefinitionBody(body);

  const existing = await db.query.measurementDefinitions.findFirst({
    where: eq(measurementDefinitions.key, data.key),
  });
  if (existing) throw new ValidationError(`测量定义 key「${data.key}」已存在`);

  const now = new Date().toISOString();
  const id = uuid();
  await db.insert(measurementDefinitions).values({
    id,
    key: data.key,
    displayName: data.displayName,
    type: data.type,
    unit: data.unit,
    trendDirection: data.trendDirection,
    referenceRange: data.referenceRange,
    modality: data.modality ?? null,
    description: data.description ?? null,
    isPreset: false,
    createdAt: now,
    updatedAt: now,
  });

  log({
    userId,
    action: AuditEvents.MEASUREMENT_SNAPSHOT,
    resource: 'measurement-definition',
    resourceId: id,
    details: { key: data.key },
  });

  const created = await db.query.measurementDefinitions.findFirst({
    where: eq(measurementDefinitions.id, id),
  });
  return c.json({ success: true, data: created }, 201);
});

// PUT /definitions/:key — update definition
measurementsRouter.put('/definitions/:key', async (c) => {
  const key = c.req.param('key');
  const body = await c.req.json();
  const userId = (c as any).get('userId') || 'system';

  const existing = await db.query.measurementDefinitions.findFirst({
    where: eq(measurementDefinitions.key, key),
  });
  if (!existing) throw new NotFoundError('测量定义');

  // Validate partial updates through the same zod schema as POST.
  const parsed = insertMeasurementDefinitionSchema.partial().safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || '定义字段不合法');
  }
  const range = parsed.data.referenceRange ?? null;
  if (range !== null) {
    const { min, max } = range as { min?: number; max?: number };
    if (min !== undefined && max !== undefined && min > max) {
      throw new ValidationError('referenceRange.min 不能大于 max');
    }
  }

  const updates: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };
  const allowed = ['displayName', 'type', 'unit', 'trendDirection', 'referenceRange', 'modality', 'description'];
  for (const field of allowed) {
    if (parsed.data[field as keyof typeof parsed.data] !== undefined) {
      updates[field] = parsed.data[field as keyof typeof parsed.data];
    }
  }

  await db.update(measurementDefinitions).set(updates).where(eq(measurementDefinitions.key, key));

  log({
    userId,
    action: AuditEvents.MEASUREMENT_SNAPSHOT,
    resource: 'measurement-definition',
    resourceId: existing.id,
    details: { key },
  });

  const updated = await db.query.measurementDefinitions.findFirst({
    where: eq(measurementDefinitions.key, key),
  });
  return c.json({ success: true, data: updated });
});

// DELETE /definitions/:key — delete definition (snapshots keep their raw key)
measurementsRouter.delete('/definitions/:key', async (c) => {
  const key = c.req.param('key');
  const userId = (c as any).get('userId') || 'system';

  const existing = await db.query.measurementDefinitions.findFirst({
    where: eq(measurementDefinitions.key, key),
  });
  if (!existing) throw new NotFoundError('测量定义');

  await db.delete(measurementDefinitions).where(eq(measurementDefinitions.key, key));

  log({
    userId,
    action: AuditEvents.MEASUREMENT_SNAPSHOT,
    resource: 'measurement-definition',
    resourceId: existing.id,
    details: { key },
  });

  return c.json({ success: true, message: '已删除' });
});

// GET /trends — longitudinal series for a patient, ordered by (key, studyDate)
measurementsRouter.get('/trends', async (c) => {
  const patientId = c.req.query('patientId');
  const studyIdsParam = c.req.query('studyIds');

  let studyFilter;
  if (studyIdsParam) {
    const ids = studyIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      studyFilter = sql`${studies.id} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;
    }
  } else if (patientId) {
    studyFilter = eq(studies.patientId, patientId);
  } else {
    throw new ValidationError('需要 patientId 或 studyIds 参数');
  }

  await ensurePresetDefinitions();

  // Join measurement_points with studies to attach studyDate.
  const rows = await db
    .select({
      id: measurementPoints.id,
      studyId: measurementPoints.studyId,
      imageId: measurementPoints.imageId,
      measurementKey: measurementPoints.measurementKey,
      type: measurementPoints.type,
      value: measurementPoints.value,
      unit: measurementPoints.unit,
      calibrated: measurementPoints.calibrated,
      capturedAt: measurementPoints.capturedAt,
      studyDate: studies.studyDate,
      studyTime: studies.studyTime,
    })
    .from(measurementPoints)
    .innerJoin(studies, eq(measurementPoints.studyId, studies.id))
    .where(studyFilter)
    .orderBy(asc(measurementPoints.measurementKey), asc(studies.studyDate), asc(studies.studyTime), asc(measurementPoints.capturedAt));

  // Definitions for metadata (reference range / trend direction / display name).
  const defs = await db.query.measurementDefinitions.findMany({});
  const defByKey = new Map(defs.map((d) => [d.key, d]));

  // Group into series by key, preserving ordering.
  const seriesMap = new Map<string, any>();
  for (const row of rows) {
    let series = seriesMap.get(row.measurementKey);
    if (!series) {
      const def = defByKey.get(row.measurementKey);
      series = {
        key: row.measurementKey,
        definition: def
          ? {
              key: def.key,
              displayName: def.displayName,
              type: def.type,
              unit: def.unit,
              trendDirection: def.trendDirection,
              referenceRange: def.referenceRange,
              modality: def.modality,
            }
          : null,
        points: [],
      };
      seriesMap.set(row.measurementKey, series);
    }
    series.points.push({
      id: row.id,
      studyId: row.studyId,
      imageId: row.imageId,
      value: row.value,
      unit: row.unit,
      calibrated: row.calibrated,
      type: row.type,
      capturedAt: row.capturedAt,
      studyDate: row.studyDate,
      studyTime: row.studyTime,
    });
  }

  return c.json({
    success: true,
    data: {
      patientId,
      series: Array.from(seriesMap.values()),
    },
  });
});

export default measurementsRouter;
