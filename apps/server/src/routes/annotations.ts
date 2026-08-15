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
import { db, annotations, insertAnnotationSchema, images, measurementPoints } from '../db';
import { extractMeasurements } from '../lib/measurement-extract';
import { getDefinitionMap } from '../db/measurement-definitions';
import { log } from '../lib/audit';
import { AuditEvents } from '../lib/audit-events';

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

// POST /sync — Batch sync annotations for an image
// Replaces all annotations for the given imageId with the provided set.
//
// Contract per annotation (Cornerstone serialization round-trip):
//   {
//     id?: string,
//     toolName: string,                          // e.g. 'Length' | 'Angle' | 'EllipticalROI' ...
//     data: {
//       handles: { points: Point3[] },           // verbatim Cornerstone handles (points are [x,y,z])
//       cachedStats?: Record<string, any>,       // measurement results keyed by targetId
//       label?: string,
//       text?: string,
//     },
//     style?: Record<string, any>,
//   }
// Malformed payloads are rejected with 400 and a reason.
annotationsRouter.post('/sync', async (c) => {
  const body = await c.req.json();
  const { imageId, annotations: newAnnotations } = body;

  if (!imageId || typeof imageId !== 'string') {
    return c.json({ success: false, message: 'imageId 必须是非空字符串' }, 400);
  }

  if (!Array.isArray(newAnnotations)) {
    return c.json({ success: false, message: 'annotations 必须是数组' }, 400);
  }

  const invalid = validateAnnotationContract(newAnnotations);
  if (invalid) {
    return c.json({ success: false, message: invalid }, 400);
  }

  const userId = (c as any).get('userId') || body.userId;
  if (!userId) {
    return c.json({ success: false, message: '未认证' }, 401);
  }

  const now = new Date().toISOString();

  // Resolve the study through the image → series chain (authoritative). Image
  // annotations belong to their study, so study-scoped queries (follow-up
  // compare, measurement snapshots) find them even when the client did not
  // send a studyId.
  const img = await db.query.images.findFirst({
    where: eq(images.id, imageId),
    with: { series: true },
  });
  const resolvedStudyId = img?.series?.studyId ?? null;

  // Delete existing annotations for this image
  await db.delete(annotations).where(eq(annotations.imageId, imageId));

  // Insert new annotations
  if (newAnnotations.length > 0) {
    const rows = newAnnotations.map((ann: any) => ({
      id: ann.id || crypto.randomUUID(),
      imageId,
      studyId: ann.studyId || resolvedStudyId || null,
      userId,
      layerId: ann.layerId || null,
      type: mapToolNameToType(ann.toolName),
      geometry: JSON.stringify({
        toolName: ann.toolName,
        handles: ann.data?.handles || [],
        cachedStats: ann.data?.cachedStats,
      }),
      style: JSON.stringify(ann.style || { color: '#ffff00', lineWidth: 2 }),
      label: ann.data?.label || ann.data?.text || null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    }));

    await db.insert(annotations).values(rows);
  }

  // ── Measurement snapshot sync (wayfinder #87 / T2) ────────────────────────
  // Extract typed values (real units from Cornerstone cachedStats) into
  // measurement_points, upserted by (study_id, measurement_key). Resolve the
  // study through the image→series chain (authoritative, ignores client hints).
  await syncMeasurementPoints(imageId, newAnnotations, userId, resolvedStudyId);

  return c.json({
    success: true,
    data: { imageId, count: newAnnotations.length },
  });
});

// GET /image/:imageId — Get annotations for an image (with Cornerstone format)
annotationsRouter.get('/image/:imageId', async (c) => {
  const imageId = c.req.param('imageId');

  const results = await db.query.annotations.findMany({
    where: eq(annotations.imageId, imageId),
    with: { user: true },
  });

  // Convert to SerializedAnnotation format
  const serialized = results.map((r) => {
    const geometry = typeof r.geometry === 'string' ? JSON.parse(r.geometry) : r.geometry;
    const style = typeof r.style === 'string' ? JSON.parse(r.style) : r.style;

    return {
      id: r.id,
      // layerId round-trip (#108 决议): sent by the client on sync, persisted
      // in the DB, and restored here so the viewer can rebuild per-layer
      // grouping / visibility after a reload.
      layerId: r.layerId ?? null,
      toolName: geometry.toolName || r.type,
      data: {
        handles: geometry.handles || [],
        cachedStats: geometry.cachedStats,
        label: r.label,
        text: r.label,
      },
      style,
    };
  });

  return c.json({ success: true, data: serialized });
});

/**
 * Sync measurement_points snapshots for an image's annotations.
 *
 * Semantics (decided in wayfinder #87): one point per (study, measurement_key),
 * last write wins — saving annotations overwrites the point for that study/key.
 * Removing a measurement (or clearing the image) removes its point when it was
 * the source for that key (sourceAnnotationId matches).
 */
async function syncMeasurementPoints(
  imageId: string,
  newAnnotations: any[],
  userId: string,
  resolvedStudyId: string | null,
): Promise<void> {
  const now = new Date().toISOString();

  // Resolve studyId via image → series chain (already computed by caller).
  const studyId = resolvedStudyId;
  if (!studyId) return;

  const definitions = await getDefinitionMap();
  const definitionList = Object.values(definitions).map((d) => ({
    key: d.key,
    displayName: d.displayName,
  }));

  const extracted = extractMeasurements(newAnnotations, definitionList);

  // Points previously sourced from this image — delete the ones whose key is no
  // longer present (measurement removed or image cleared).
  const previous = await db.query.measurementPoints.findMany({
    where: eq(measurementPoints.imageId, imageId),
  });
  for (const prev of previous) {
    const stillPresent = extracted.some((m) => m.measurementKey === prev.measurementKey);
    if (!stillPresent) {
      await db.delete(measurementPoints).where(eq(measurementPoints.id, prev.id));
    }
  }

  // Upsert current measurements: delete any existing point for (study, key)
  // then insert the fresh snapshot (last write wins).
  for (const m of extracted) {
    await db.delete(measurementPoints).where(
      and(
        eq(measurementPoints.studyId, studyId),
        eq(measurementPoints.measurementKey, m.measurementKey),
      ),
    );
    await db.insert(measurementPoints).values({
      id: uuid(),
      studyId,
      imageId,
      measurementKey: m.measurementKey,
      type: m.type,
      value: m.value,
      unit: m.unit,
      calibrated: m.calibrated,
      sourceAnnotationId: null,
      capturedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (extracted.length > 0) {
    try {
      await log({
        userId,
        action: AuditEvents.MEASUREMENT_SNAPSHOT,
        resource: 'measurement',
        resourceId: studyId,
        details: { imageId, studyId, count: extracted.length, keys: extracted.map((m) => m.measurementKey) },
      });
    } catch (err) {
      console.warn('[measurements] audit log failed:', err);
    }
  }
}

/**
 * Validate the annotation sync contract.
 *
 * Each annotation must match the Cornerstone serialization shape:
 *   { toolName: string, data: { handles: { points: Point3[] }, cachedStats?: object }, ... }
 * Points may be arrays [x,y,z] (Cornerstone native) or {x,y,z} objects.
 *
 * @returns an error message describing the first violation, or null when valid.
 */
function validateAnnotationContract(annotations: unknown[]): string | null {
  for (let i = 0; i < annotations.length; i++) {
    const ann = annotations[i];
    if (!ann || typeof ann !== 'object' || Array.isArray(ann)) {
      return `annotations[${i}] 必须是对象`;
    }
    const a = ann as Record<string, any>;

    if (typeof a.toolName !== 'string' || !a.toolName.trim()) {
      return `annotations[${i}].toolName 缺失或不是非空字符串`;
    }
    if (!a.data || typeof a.data !== 'object' || Array.isArray(a.data)) {
      return `annotations[${i}].data 缺失或不是对象`;
    }
    const handles = a.data.handles;
    if (!handles || typeof handles !== 'object' || Array.isArray(handles)) {
      return `annotations[${i}].data.handles 缺失或不是对象`;
    }
    const points = (handles as Record<string, any>).points;
    if (!Array.isArray(points) || points.length === 0) {
      return `annotations[${i}].data.handles.points 缺失或不是非空数组`;
    }
    for (const p of points) {
      const valid =
        Array.isArray(p)
          ? p.length >= 2 && p.slice(0, 3).every((v: any) => typeof v === 'number' && Number.isFinite(v))
          : !!p && typeof p === 'object' && Number.isFinite((p as any).x) && Number.isFinite((p as any).y);
      if (!valid) {
        return `annotations[${i}].data.handles.points 包含非法坐标`;
      }
    }
    if (
      a.data.cachedStats !== undefined &&
      (a.data.cachedStats === null || typeof a.data.cachedStats !== 'object' || Array.isArray(a.data.cachedStats))
    ) {
      return `annotations[${i}].data.cachedStats 必须是对象`;
    }
    if (a.id !== undefined && typeof a.id !== 'string') {
      return `annotations[${i}].id 必须是字符串`;
    }
  }
  return null;
}

/**
 * Map Cornerstone tool names to our annotation type enum.
 */
function mapToolNameToType(toolName: string): 'measurement' | 'arrow' | 'text' | 'freehand' | 'roi' | 'highlight' {
  switch (toolName) {
    case 'Length':
    case 'Angle':
    case 'Probe':
      return 'measurement';
    case 'ArrowAnnotate':
      return 'arrow';
    case 'EllipticalROI':
    case 'RectangleROI':
    case 'FreehandROI':
    case 'SplineROI':
    case 'PlanarFreehandROI':
      return 'roi';
    default:
      return 'highlight';
  }
}

export default annotationsRouter;
