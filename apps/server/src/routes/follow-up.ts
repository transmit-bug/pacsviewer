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
import { db, followUpRecords, studies, annotations, patients } from '../db';
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
followUpRouter.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.patientId || !body.baselineStudyId || !body.comparisonStudyId) {
    throw new ValidationError('Missing required fields: patientId, baselineStudyId, comparisonStudyId');
  }

  // Verify studies exist
  const baselineStudy = await db.query.studies.findFirst({
    where: eq(studies.id, body.baselineStudyId),
  });
  const comparisonStudy = await db.query.studies.findFirst({
    where: eq(studies.id, body.comparisonStudyId),
  });

  if (!baselineStudy || !comparisonStudy) {
    throw new NotFoundError('Baseline or comparison study');
  }

  // Calculate measurements comparison
  const measurements = await compareMeasurements(body.baselineStudyId, body.comparisonStudyId);

  const id = uuid();
  const userId = (c as any).get('userId') || 'system';

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

  return c.json({ success: true, data: { id, measurements } }, 201);
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

  const comparisons: MeasurementComparison[] = [];

  // Match measurements by label
  for (const baseline of baselineAnnotations) {
    const geometry = baseline.geometry as any;
    if (!geometry?.value) continue;

    // Find matching measurement in comparison study
    const matching = comparisonAnnotations.find(a => a.label === baseline.label);
    if (!matching) continue;

    const matchingGeometry = matching.geometry as any;
    if (!matchingGeometry?.value) continue;

    const baselineValue = geometry.value;
    const comparisonValue = matchingGeometry.value;
    const delta = comparisonValue - baselineValue;
    const deltaPercent = baselineValue !== 0 ? (delta / baselineValue) * 100 : 0;

    // Determine trend
    const trend = determineTrend(baseline.label || '', delta, deltaPercent);

    // Determine if change is significant (typically >5-10% for most measurements)
    const isSignificant = Math.abs(deltaPercent) > 5;

    comparisons.push({
      type: geometry.type || 'unknown',
      label: baseline.label || 'Unnamed',
      baselineValue,
      comparisonValue,
      delta,
      deltaPercent,
      unit: geometry.unit || 'μm',
      trend,
      isSignificant,
    });
  }

  return comparisons;
}

/**
 * Determine trend direction based on measurement type and change.
 */
function determineTrend(
  label: string,
  delta: number,
  deltaPercent: number
): 'improving' | 'stable' | 'worsening' {
  const threshold = 5; // 5% change threshold

  if (Math.abs(deltaPercent) < threshold) {
    return 'stable';
  }

  // For most ophthalmology measurements:
  // - Decrease in thickness (RNFL, macular) = worsening
  // - Decrease in IOP = improving
  // - Increase in C/D ratio = worsening

  const lowerLabel = label.toLowerCase();

  if (lowerLabel.includes('iop') || lowerLabel.includes('眼压')) {
    return delta < 0 ? 'improving' : 'worsening';
  }

  if (lowerLabel.includes('rnfl') || lowerLabel.includes('厚度') || lowerLabel.includes('thickness')) {
    return delta < 0 ? 'worsening' : 'improving';
  }

  if (lowerLabel.includes('c/d') || lowerLabel.includes('cup')) {
    return delta > 0 ? 'worsening' : 'improving';
  }

  // Default: improvement if value increases
  return delta > 0 ? 'improving' : 'worsening';
}

export default followUpRouter;
