/**
 * Follow-up API Routes
 *
 * Manages follow-up records for patient longitudinal analysis.
 * Allows comparing measurements across different time points.
 *
 * Endpoints:
 *   GET /              - List follow-up records for a patient
 *   POST /             - Create a new follow-up record
 *   GET /:id           - Get a specific follow-up record
 *   PUT /:id           - Update a follow-up record
 *   DELETE /:id        - Delete a follow-up record
 *   GET /:id/compare   - Get comparison data between baseline and comparison studies
 */

import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { db, followUpRecords, studies, annotations, } from '../db';
import { extractMeasurementValue } from '../lib/measurement-extract';
import { getDefinitionMap } from '../db/measurement-definitions';
import { NotFoundError, ValidationError } from '../lib/errors';
import { log } from '../lib/audit';
import { AuditEvents } from '../lib/audit-events';
import { v4 as uuid } from 'uuid';

const followUpRouter = new Hono();

// GET / — List follow-up records for a patient
followUpRouter.get('/', async (c) => {
  const patientId = c.req.query('patientId');
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 20));
  const offset = (page - 1) * pageSize;

  if (!patientId) {
    throw new ValidationError('patientId is required');
  }

  const where = eq(followUpRecords.patientId, patientId);

  const items = await db.query.followUpRecords.findMany({
    where,
    with: {
      baselineStudy: true,
      comparisonStudy: true,
      creator: true,
    },
    orderBy: [desc(followUpRecords.createdAt)],
    limit: pageSize,
    offset,
  });

  const countResult = await db
    .select({ count: followUpRecords.id })
    .from(followUpRecords)
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

// POST / — Create a new follow-up record
// Same (patientId, baselineStudyId, comparisonStudyId) pair saves → upsert
// (update measurements + notes) instead of creating a duplicate. (T5)
followUpRouter.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.patientId || !body.baselineStudyId || !body.comparisonStudyId) {
    throw new ValidationError('Missing required fields: patientId, baselineStudyId, comparisonStudyId');
  }

  // Verify studies exist and belong to the patient
  const baselineStudy = await db.query.studies.findFirst({
    where: eq(studies.id, body.baselineStudyId),
  });
  const comparisonStudy = await db.query.studies.findFirst({
    where: eq(studies.id, body.comparisonStudyId),
  });

  if (!baselineStudy || !comparisonStudy) {
    throw new NotFoundError('Baseline or comparison study');
  }
  if (baselineStudy.patientId !== body.patientId || comparisonStudy.patientId !== body.patientId) {
    throw new ValidationError('基线与对比检查必须属于同一患者');
  }
  if (body.baselineStudyId === body.comparisonStudyId) {
    throw new ValidationError('基线检查与对比检查不能是同一个');
  }

  // Calculate measurements comparison
  const measurements = await compareMeasurements(body.baselineStudyId, body.comparisonStudyId);

  const userId = (c as any).get('userId') || 'system';
  const now = new Date().toISOString();

  // Duplicate handling: same pair → update existing record (last save wins)
  const existing = await db.query.followUpRecords.findFirst({
    where: and(
      eq(followUpRecords.patientId, body.patientId),
      eq(followUpRecords.baselineStudyId, body.baselineStudyId),
      eq(followUpRecords.comparisonStudyId, body.comparisonStudyId),
    ),
  });

  if (existing) {
    await db.update(followUpRecords)
      .set({
        measurements,
        notes: body.notes ?? existing.notes,
        updatedAt: now,
      })
      .where(eq(followUpRecords.id, existing.id));

    log({
      userId,
      action: AuditEvents.FOLLOWUP_UPDATE,
      resource: 'followup',
      resourceId: existing.id,
      details: {
        patientId: body.patientId,
        baselineStudyId: body.baselineStudyId,
        comparisonStudyId: body.comparisonStudyId,
        duplicated: true,
      },
    });

    return c.json({
      success: true,
      data: { id: existing.id, updated: true, measurements },
    });
  }

  const id = uuid();

  await db.insert(followUpRecords).values({
    id,
    patientId: body.patientId,
    baselineStudyId: body.baselineStudyId,
    comparisonStudyId: body.comparisonStudyId,
    measurements,
    notes: body.notes || null,
    createdBy: userId,
  });

  // Audit log
  log({
    userId,
    action: AuditEvents.FOLLOWUP_CREATE,
    resource: 'followup',
    resourceId: id,
    details: {
      patientId: body.patientId,
      baselineStudyId: body.baselineStudyId,
      comparisonStudyId: body.comparisonStudyId,
    },
  });

  return c.json({ success: true, data: { id, updated: false, measurements } }, 201);
});

// GET /:id — Get a specific follow-up record
followUpRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  const item = await db.query.followUpRecords.findFirst({
    where: eq(followUpRecords.id, id),
    with: {
      baselineStudy: true,
      comparisonStudy: true,
      creator: true,
      patient: true,
    },
  });

  if (!item) {
    throw new NotFoundError('Follow-up record');
  }

  return c.json({ success: true, data: item });
});

// PUT /:id — Update a follow-up record
followUpRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const userId = (c as any).get('userId') || 'system';

  const existing = await db.query.followUpRecords.findFirst({
    where: eq(followUpRecords.id, id),
  });

  if (!existing) {
    throw new NotFoundError('Follow-up record');
  }

  await db.update(followUpRecords)
    .set({
      notes: body.notes ?? existing.notes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(followUpRecords.id, id));

  log({
    userId,
    action: AuditEvents.FOLLOWUP_UPDATE,
    resource: 'followup',
    resourceId: id,
  });

  return c.json({ success: true, message: '已更新' });
});

// DELETE /:id — Delete a follow-up record
followUpRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const userId = (c as any).get('userId') || 'system';

  const existing = await db.query.followUpRecords.findFirst({
    where: eq(followUpRecords.id, id),
  });

  if (!existing) {
    throw new NotFoundError('Follow-up record');
  }

  await db.delete(followUpRecords).where(eq(followUpRecords.id, id));

  log({
    userId,
    action: 'delete',
    resource: 'followup',
    resourceId: id,
  });

  return c.json({ success: true, message: '已删除' });
});

// GET /:id/compare — Get detailed comparison data
followUpRouter.get('/:id/compare', async (c) => {
  const id = c.req.param('id');

  const record = await db.query.followUpRecords.findFirst({
    where: eq(followUpRecords.id, id),
    with: {
      baselineStudy: true,
      comparisonStudy: true,
      patient: true,
    },
  });

  if (!record) {
    throw new NotFoundError('Follow-up record');
  }

  // Get annotations for both studies
  const baselineAnnotations = await db.query.annotations.findMany({
    where: eq(annotations.studyId, record.baselineStudyId),
  });

  const comparisonAnnotations = await db.query.annotations.findMany({
    where: eq(annotations.studyId, record.comparisonStudyId),
  });

  // Filter for measurements
  const baselineMeasurements = baselineAnnotations.filter(a => a.type === 'measurement');
  const comparisonMeasurements = comparisonAnnotations.filter(a => a.type === 'measurement');

  return c.json({
    success: true,
    data: {
      record,
      baselineMeasurements,
      comparisonMeasurements,
      measurements: record.measurements,
    },
  });
});

// ─── Helper Functions ─────────────────────────────────────────────────────────

interface MeasurementComparison {
  type: string;
  label: string;
  measurementKey: string;
  baselineValue: number;
  comparisonValue: number;
  delta: number;
  deltaPercent: number;
  unit: string;
  trend: 'improving' | 'stable' | 'worsening';
  isSignificant: boolean;
}

/**
 * Compare measurements between two studies.
 *
 * Uses the T1 Cornerstone contract (annotations stored as
 * { toolName, handles, cachedStats }) — values are typed-extracted from
 * cachedStats (wayfinder #92), not from the legacy `geometry.value` shape.
 * Measurements are matched across studies by their dictionary key (label
 * fallback); trend direction comes from measurement_definitions.
 */
async function compareMeasurements(
  baselineStudyId: string,
  comparisonStudyId: string
): Promise<MeasurementComparison[]> {
  // Get annotations for both studies
  const baselineAnnotations = await db.query.annotations.findMany({
    where: and(
      eq(annotations.studyId, baselineStudyId),
      eq(annotations.type, 'measurement')
    ),
  });

  const comparisonAnnotations = await db.query.annotations.findMany({
    where: and(
      eq(annotations.studyId, comparisonStudyId),
      eq(annotations.type, 'measurement')
    ),
  });

  const definitions = await getDefinitionMap();
  const definitionList = Object.values(definitions).map((d) => ({ key: d.key, displayName: d.displayName }));

  const extract = (ann: typeof baselineAnnotations[number]) => {
    const geometry = typeof ann.geometry === 'string' ? JSON.parse(ann.geometry) : ann.geometry;
    const serialized = {
      toolName: geometry.toolName ?? ann.type,
      data: {
        cachedStats: geometry.cachedStats,
        label: ann.label ?? undefined,
      },
    };
    const m = extractMeasurementValue(serialized, definitionList);
    return m ? { ...m, label: ann.label } : null;
  };

  const baseline = baselineAnnotations.map(extract).filter((m): m is NonNullable<typeof m> => m !== null);
  const comparison = comparisonAnnotations.map(extract).filter((m): m is NonNullable<typeof m> => m !== null);

  const comparisons: MeasurementComparison[] = [];
  const usedComparison = new Set<string>();

  for (const b of baseline) {
    const matching = comparison.find(
      (m) => !usedComparison.has(m.measurementKey) && m.measurementKey === b.measurementKey
    );
    if (!matching) continue;
    usedComparison.add(matching.measurementKey);

    const baselineValue = b.value;
    const comparisonValue = matching.value;
    const delta = comparisonValue - baselineValue;
    const deltaPercent = baselineValue !== 0 ? (delta / baselineValue) * 100 : 0;

    const def = definitions[b.measurementKey];
    const trend = determineTrend(def?.trendDirection, delta, deltaPercent);
    const isSignificant = Math.abs(deltaPercent) > 5;

    comparisons.push({
      type: b.type,
      label: b.label || def?.displayName || b.measurementKey,
      measurementKey: b.measurementKey,
      baselineValue,
      comparisonValue,
      delta,
      deltaPercent,
      unit: b.unit,
      trend,
      isSignificant,
    });
  }

  return comparisons;
}

/**
 * Determine trend direction from the dictionary's trend_direction and the
 * measured delta ('down' = decreasing is worsening, 'up' = increasing is
 * worsening). Threshold: |relative change| < 5% → stable.
 */
function determineTrend(
  direction: 'up' | 'down' | undefined,
  delta: number,
  deltaPercent: number
): 'improving' | 'stable' | 'worsening' {
  const threshold = 5;
  if (Math.abs(deltaPercent) < threshold) {
    return 'stable';
  }
  const dir = direction ?? 'up';
  const worse = dir === 'down' ? delta < 0 : delta > 0;
  return worse ? 'worsening' : 'improving';
}

export default followUpRouter;
