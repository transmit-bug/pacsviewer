/**
 * Follow-up record tests — delta table contract (T5) + duplicate handling.
 *
 * Verifies:
 *   - POST /follow-up computes measurements from T1 Cornerstone-format
 *     annotations (cachedStats), not the legacy geometry.value shape
 *   - trend direction is dictionary-driven (RNFL decrease = worsening)
 *   - saving the same (patient, baseline, comparison) pair updates instead of
 *     duplicating
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { createTestApp, request } from './helpers';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { db, patients, studies, series, images, annotations, followUpRecords, measurementPoints } from '../src/db';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

const TARGET_ID = 'wadouri:http://localhost:3000/api/images/img-x/file';
const createdPatientIds: string[] = [];

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(() => {
  ctx.cleanup();
});

afterEach(async () => {
  for (const patientId of createdPatientIds.splice(0)) {
    const patientStudies = await db.query.studies.findMany({ where: eq(studies.patientId, patientId) });
    const studyIds = patientStudies.map((s) => s.id);
    for (const studyId of studyIds) {
      await db.delete(followUpRecords).where(eq(followUpRecords.baselineStudyId, studyId));
      await db.delete(followUpRecords).where(eq(followUpRecords.comparisonStudyId, studyId));
      const seriesRows = await db.query.series.findMany({ where: eq(series.studyId, studyId) });
      for (const s of seriesRows) {
        const imgs = await db.query.images.findMany({ where: eq(images.seriesId, s.id) });
        // FK enforcement (#118): measurement_points reference images — purge first
        await db.delete(measurementPoints).where(eq(measurementPoints.studyId, studyId));
        for (const img of imgs) {
          await db.delete(annotations).where(eq(annotations.imageId, img.id));
        }
        for (const img of imgs) {
          await db.delete(images).where(eq(images.id, img.id));
        }
        await db.delete(series).where(eq(series.id, s.id));
      }
      await db.delete(studies).where(eq(studies.id, studyId));
    }
    await db.delete(patients).where(eq(patients.id, patientId));
  }
});

async function createFixture() {
  const patientId = uuid();
  const baselineStudyId = uuid();
  const comparisonStudyId = uuid();
  const now = new Date().toISOString();

  await db.insert(patients).values({
    id: patientId, mrn: `mrn-fu-${uuid().slice(0, 8)}`, name: '随访测试', gender: 'male', birthDate: '1980-01-01',
    createdAt: now, updatedAt: now,
  });
  await db.insert(studies).values([
    { id: baselineStudyId, patientId, studyDate: '2025-01-10', studyTime: '09:00:00', modality: 'OCT', status: 'reported', createdAt: now, updatedAt: now },
    { id: comparisonStudyId, patientId, studyDate: '2025-11-02', studyTime: '10:00:00', modality: 'OCT', status: 'reported', createdAt: now, updatedAt: now },
  ]);

  const imageIdFor = async (studyId: string) => {
    const seriesId = uuid();
    await db.insert(series).values({ id: seriesId, studyId, seriesNumber: 1, modality: 'OCT', imageCount: 1, createdAt: now });
    const imageId = uuid();
    await db.insert(images).values({
      id: imageId, seriesId, instanceNumber: 1, filePath: 'x.png', fileSize: 1, fileHash: 'h', format: 'png', width: 512, height: 512, createdAt: now,
    });
    return imageId;
  };

  const baselineImageId = await imageIdFor(baselineStudyId);
  const comparisonImageId = await imageIdFor(comparisonStudyId);
  createdPatientIds.push(patientId);

  return { patientId, baselineStudyId, comparisonStudyId, baselineImageId, comparisonImageId };
}

function lengthAnnotation(value: number, label: string, id: string) {
  return {
    id,
    toolName: 'Length',
    data: {
      handles: { points: [[0, 0, 0], [10, 0, 0]] },
      cachedStats: { [TARGET_ID]: { length: value, unit: 'mm', statsArray: [] } },
      label,
    },
    style: { color: '#ffff00', lineWidth: 2 },
  };
}

describe('POST /api/follow-up — delta table contract', () => {
  test('measurements computed from Cornerstone cachedStats with dict-driven trend', async () => {
    const { patientId, baselineStudyId, comparisonStudyId, baselineImageId, comparisonImageId } = await createFixture();

    // Baseline RNFL 92mm → comparison 85mm (-7.6%, worsening for 'down' dir)
    for (const [imageId, value] of [[baselineImageId, 92], [comparisonImageId, 85]] as const) {
      const res = await request(ctx.app, 'POST', '/api/annotations/sync', {
        headers: ctx.authHeaders,
        body: { imageId, annotations: [lengthAnnotation(value, 'RNFL 厚度', `ann-${imageId}`)] },
      });
      expect(res.status).toBe(200);
    }

    const res = await request(ctx.app, 'POST', '/api/follow-up', {
      headers: ctx.authHeaders,
      body: { patientId, baselineStudyId, comparisonStudyId },
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.updated).toBe(false);
    expect(data.measurements).toHaveLength(1);

    const m = data.measurements[0];
    expect(m.measurementKey).toBe('rnfl');
    expect(m.label).toBe('RNFL 厚度');
    expect(m.baselineValue).toBe(92);
    expect(m.comparisonValue).toBe(85);
    expect(m.delta).toBe(-7);
    expect(m.unit).toBe('mm');
    expect(m.trend).toBe('worsening');
    expect(m.isSignificant).toBe(true);
  });

  test('IOP increase → worsening (dict trend_direction up)', async () => {
    const { patientId, baselineStudyId, comparisonStudyId, baselineImageId, comparisonImageId } = await createFixture();
    for (const [imageId, value] of [[baselineImageId, 17], [comparisonImageId, 21]] as const) {
      const res = await request(ctx.app, 'POST', '/api/annotations/sync', {
        headers: ctx.authHeaders,
        body: { imageId, annotations: [lengthAnnotation(value, '眼压', `ann-iop-${imageId}`)] },
      });
      expect(res.status).toBe(200);
    }
    const res = await request(ctx.app, 'POST', '/api/follow-up', {
      headers: ctx.authHeaders,
      body: { patientId, baselineStudyId, comparisonStudyId },
    });
    const m = (await res.json()).data.measurements[0];
    expect(m.measurementKey).toBe('iop');
    expect(m.trend).toBe('worsening');
    expect(m.deltaPercent).toBeCloseTo((21 - 17) / 17 * 100, 1);
  });

  test('stable when change ≤ 5%', async () => {
    const { patientId, baselineStudyId, comparisonStudyId, baselineImageId, comparisonImageId } = await createFixture();
    for (const [imageId, value] of [[baselineImageId, 100], [comparisonImageId, 102]] as const) {
      await request(ctx.app, 'POST', '/api/annotations/sync', {
        headers: ctx.authHeaders,
        body: { imageId, annotations: [lengthAnnotation(value, 'RNFL 厚度', `ann-st-${imageId}`)] },
      });
    }
    const res = await request(ctx.app, 'POST', '/api/follow-up', {
      headers: ctx.authHeaders,
      body: { patientId, baselineStudyId, comparisonStudyId },
    });
    const m = (await res.json()).data.measurements[0];
    expect(m.trend).toBe('stable');
  });

  test('duplicate save of the same pair updates instead of creating a new record', async () => {
    const { patientId, baselineStudyId, comparisonStudyId, baselineImageId, comparisonImageId } = await createFixture();
    for (const [imageId, value] of [[baselineImageId, 92], [comparisonImageId, 85]] as const) {
      await request(ctx.app, 'POST', '/api/annotations/sync', {
        headers: ctx.authHeaders,
        body: { imageId, annotations: [lengthAnnotation(value, 'RNFL 厚度', `ann-d-${imageId}`)] },
      });
    }

    const first = await request(ctx.app, 'POST', '/api/follow-up', {
      headers: ctx.authHeaders,
      body: { patientId, baselineStudyId, comparisonStudyId },
    });
    expect(first.status).toBe(201);
    const firstData = (await first.json()).data;
    expect(firstData.updated).toBe(false);

    const second = await request(ctx.app, 'POST', '/api/follow-up', {
      headers: ctx.authHeaders,
      body: { patientId, baselineStudyId, comparisonStudyId, notes: '第二次保存' },
    });
    expect(second.status).toBe(200);
    const secondData = (await second.json()).data;
    expect(secondData.updated).toBe(true);
    expect(secondData.id).toBe(firstData.id);

    // Only one record for the pair
    const records = await db.query.followUpRecords.findMany({
      where: eq(followUpRecords.baselineStudyId, baselineStudyId),
    });
    expect(records).toHaveLength(1);
    expect(records[0].notes).toBe('第二次保存');

    // GET /:id returns the persisted measurements
    const getRes = await request(ctx.app, 'GET', `/api/follow-up/${firstData.id}`, { headers: ctx.authHeaders });
    expect(getRes.status).toBe(200);
    const record = (await getRes.json()).data;
    expect(record.measurements).toHaveLength(1);
    expect(record.measurements[0].trend).toBe('worsening');
  });

  test('rejects same-study pair and cross-patient studies', async () => {
    const { patientId, comparisonStudyId, comparisonImageId } = await createFixture();
    await request(ctx.app, 'POST', '/api/annotations/sync', {
      headers: ctx.authHeaders,
      body: { imageId: comparisonImageId, annotations: [lengthAnnotation(85, 'RNFL 厚度', 'ann-x')] },
    });

    const same = await request(ctx.app, 'POST', '/api/follow-up', {
      headers: ctx.authHeaders,
      body: { patientId, baselineStudyId: comparisonStudyId, comparisonStudyId },
    });
    expect(same.status).toBe(400);

    const cross = await request(ctx.app, 'POST', '/api/follow-up', {
      headers: ctx.authHeaders,
      body: { patientId: 'other-patient', baselineStudyId: comparisonStudyId, comparisonStudyId },
    });
    expect(cross.status).toBe(400);
  });
});
