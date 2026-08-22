/**
 * Measurement snapshot tests — T2 (wayfinder #100)
 *
 * Covers:
 *   - Pure extraction from Cornerstone cachedStats (real units, px uncalibrated)
 *   - Dictionary key resolution (label → controlled key)
 *   - POST /annotations/sync → measurement_points rows (upsert by study+key)
 *   - GET /measurements/trends grouped by (key, studyDate)
 *   - GET /measurements/definitions preset dictionary
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { createTestApp, request } from './helpers';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { db, measurementPoints, patients, studies, series, images, annotations } from '../src/db';
import {
  extractMeasurementValue,
  extractMeasurements,
  resolveMeasurementKey,
  isPixelUnit,
} from '../src/lib/measurement-extract';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

const TARGET_ID = 'wadouri:http://localhost:3000/api/images/img-1/file';

const DEFS = [
  { key: 'rnfl', displayName: 'RNFL 厚度' },
  { key: 'fovea', displayName: '黄斑中心凹厚度' },
  { key: 'iop', displayName: '眼压' },
];

// ─── Fixture helpers ─────────────────────────────────────────────────────────

interface Fixture {
  patientId: string;
  baselineStudyId: string;
  followupStudyId: string;
  imageId: string;
}

const createdFixtures: Fixture[] = [];

async function createFixture(studyDates: [string, string] = ['2025-01-10', '2025-11-02']): Promise<Fixture> {
  const patientId = uuid();
  const baselineStudyId = uuid();
  const followupStudyId = uuid();
  const seriesId = uuid();
  const imageId = uuid();
  const now = new Date().toISOString();

  await db.insert(patients).values({
    id: patientId,
    mrn: `mrn-${uuid().slice(0, 8)}`,
    name: '测试患者',
    gender: 'male',
    birthDate: '1980-01-01',
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(studies).values([
    {
      id: baselineStudyId,
      patientId,
      studyDate: studyDates[0],
      studyTime: '09:00:00',
      modality: 'OCT',
      status: 'reported',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: followupStudyId,
      patientId,
      studyDate: studyDates[1],
      studyTime: '10:30:00',
      modality: 'OCT',
      status: 'reported',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(series).values({
    id: seriesId,
    studyId: baselineStudyId,
    seriesNumber: 1,
    modality: 'OCT',
    imageCount: 1,
    createdAt: now,
  });
  await db.insert(images).values({
    id: imageId,
    seriesId,
    instanceNumber: 1,
    filePath: 'test.png',
    fileSize: 100,
    fileHash: 'hash',
    format: 'png',
    width: 512,
    height: 512,
    createdAt: now,
  });

  const fixture = { patientId, baselineStudyId, followupStudyId, imageId };
  createdFixtures.push(fixture);
  return fixture;
}

function annotation(overrides: Record<string, any> = {}) {
  return {
    id: uuid(),
    toolName: 'Length',
    data: {
      handles: { points: [[10, 20, 0], [30, 40, 0]] },
      cachedStats: { [TARGET_ID]: { length: 25, unit: 'mm', statsArray: [] } },
      label: 'RNFL 厚度',
    },
    style: { color: '#ffff00', lineWidth: 2 },
    ...overrides,
  };
}

async function sync(imageId: string, annotationsPayload: any[]) {
  return request(ctx.app, 'POST', '/api/annotations/sync', {
    body: { imageId, annotations: annotationsPayload },
    headers: ctx.authHeaders,
  });
}

async function getPointsForStudy(studyId: string) {
  return db.query.measurementPoints.findMany({
    where: eq(measurementPoints.studyId, studyId),
  });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(() => {
  ctx.cleanup();
});

afterEach(async () => {
  // Clean up all fixture rows (reverse dependency order)
  const fixtureIds = createdFixtures.splice(0);
  const imageIds = fixtureIds.map((f) => f.imageId);
  const studyIds = fixtureIds.flatMap((f) => [f.baselineStudyId, f.followupStudyId]);
  const patientIds = fixtureIds.map((f) => f.patientId);

  for (const imageId of imageIds) {
    await db.delete(measurementPoints).where(eq(measurementPoints.imageId, imageId));
    await db.delete(annotations).where(eq(annotations.imageId, imageId));
  }
  for (const imageId of imageIds) {
    await db.delete(images).where(eq(images.id, imageId));
  }
  for (const studyId of studyIds) {
    await db.delete(measurementPoints).where(eq(measurementPoints.studyId, studyId));
  }
  // series rows reference studies — delete series BEFORE studies (FK #118)
  for (const studyId of studyIds) {
    const seriesRows = await db.query.series.findMany({ where: eq(series.studyId, studyId) });
    for (const s of seriesRows) {
      await db.delete(series).where(eq(series.id, s.id));
    }
  }
  for (const studyId of studyIds) {
    await db.delete(studies).where(eq(studies.id, studyId));
  }
  for (const patientId of patientIds) {
    await db.delete(patients).where(eq(patients.id, patientId));
  }
});

// ─── Pure extraction function tests ──────────────────────────────────────────

describe('extractMeasurementValue — units & calibration', () => {
  test('Length with calibrated mm unit → value + real unit, calibrated=true', () => {
    const result = extractMeasurementValue(
      annotation({ data: { handles: { points: [[0, 0, 0], [1, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 12.5, unit: 'mm' } }, label: 'x' } }),
      DEFS,
    );
    expect(result).not.toBeNull();
    expect(result!.value).toBe(12.5);
    expect(result!.unit).toBe('mm');
    expect(result!.calibrated).toBe(true);
    expect(result!.type).toBe('length');
  });

  test('Length without calibration → px unit, calibrated=false', () => {
    const result = extractMeasurementValue(
      annotation({ data: { handles: { points: [[0, 0, 0], [1, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 50 } }, label: 'x' } }),
      DEFS,
    );
    expect(result).not.toBeNull();
    expect(result!.unit).toBe('px');
    expect(result!.calibrated).toBe(false);
  });

  test('Length with distanceUnit fallback', () => {
    const result = extractMeasurementValue(
      annotation({ data: { handles: { points: [[0, 0, 0], [1, 0, 0]] }, cachedStats: { [TARGET_ID]: { distance: 3.3, distanceUnit: 'cm' } }, label: 'x' } }),
      DEFS,
    );
    expect(result!.value).toBe(3.3);
    expect(result!.unit).toBe('cm');
    expect(result!.calibrated).toBe(true);
  });

  test('Angle → ° unit', () => {
    const result = extractMeasurementValue(
      annotation({ toolName: 'Angle', data: { handles: { points: [[0, 0, 0], [5, 0, 0], [5, 5, 0]] }, cachedStats: { [TARGET_ID]: { angle: 45.5 } }, label: 'x' } }),
      DEFS,
    );
    expect(result!.value).toBe(45.5);
    expect(result!.unit).toBe('°');
    expect(result!.calibrated).toBe(true);
  });

  test('ROI area with areaUnit → real unit', () => {
    const result = extractMeasurementValue(
      annotation({ toolName: 'EllipticalROI', data: { handles: { points: [[0, 0, 0], [10, 5, 0]] }, cachedStats: { [TARGET_ID]: { area: 157.08, areaUnit: 'mm²' } }, label: 'x' } }),
      DEFS,
    );
    expect(result!.value).toBe(157.08);
    expect(result!.unit).toBe('mm²');
    expect(result!.calibrated).toBe(true);
    expect(result!.type).toBe('area');
  });

  test('ROI area without areaUnit → px² + uncalibrated', () => {
    const result = extractMeasurementValue(
      annotation({ toolName: 'RectangleROI', data: { handles: { points: [[0, 0, 0], [10, 10, 0]] }, cachedStats: { [TARGET_ID]: { area: 100 } }, label: 'x' } }),
      DEFS,
    );
    expect(result!.unit).toBe('px²');
    expect(result!.calibrated).toBe(false);
  });

  test('Probe scalarValue → modality unit', () => {
    const result = extractMeasurementValue(
      annotation({ toolName: 'Probe', data: { handles: { points: [[5, 5, 0]] }, cachedStats: { [TARGET_ID]: { scalarValue: 42, modalityUnit: 'HU' } }, label: 'x' } }),
      DEFS,
    );
    expect(result!.value).toBe(42);
    expect(result!.unit).toBe('HU');
  });

  test('non-measuring tool → null', () => {
    const result = extractMeasurementValue(
      annotation({ toolName: 'ArrowAnnotate', data: { handles: { points: [[0, 0, 0], [1, 1, 0]] }, cachedStats: { [TARGET_ID]: { length: 5 } }, label: 'x' } }),
      DEFS,
    );
    expect(result).toBeNull();
  });

  test('missing cachedStats → null', () => {
    const result = extractMeasurementValue(
      { toolName: 'Length', data: { handles: { points: [[0, 0, 0], [1, 1, 0]] }, label: 'x' } },
      DEFS,
    );
    expect(result).toBeNull();
  });

  test('non-finite value → null', () => {
    const result = extractMeasurementValue(
      annotation({ data: { handles: { points: [[0, 0, 0], [1, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: NaN } }, label: 'x' } }),
      DEFS,
    );
    expect(result).toBeNull();
  });
});

describe('resolveMeasurementKey — dictionary mapping', () => {
  test('displayName match → dict key', () => {
    expect(resolveMeasurementKey('RNFL 厚度', 'Length', DEFS)).toBe('rnfl');
  });

  test('key match (case-insensitive) → dict key', () => {
    expect(resolveMeasurementKey('IOP', 'Length', DEFS)).toBe('iop');
  });

  test('unknown label → slugified fallback', () => {
    expect(resolveMeasurementKey('黄斑区 1mm 直径', 'Length', DEFS)).toBe('黄斑区_1mm_直径');
  });

  test('no label → toolName slug', () => {
    expect(resolveMeasurementKey(null, 'Length', DEFS)).toBe('length');
  });

  test('batch extraction filters non-measuring tools', () => {
    const batch = [
      annotation({}),
      annotation({ toolName: 'ArrowAnnotate', data: { handles: { points: [[0, 0, 0], [1, 1, 0]] }, cachedStats: { [TARGET_ID]: { length: 5 } }, label: 'x' } }),
    ];
    const results = extractMeasurements(batch as any, DEFS);
    expect(results).toHaveLength(1);
  });
});

describe('isPixelUnit', () => {
  test('px detection', () => {
    expect(isPixelUnit('px')).toBe(true);
    expect(isPixelUnit('px²')).toBe(true);
    expect(isPixelUnit('mm')).toBe(false);
    expect(isPixelUnit(null)).toBe(false);
    expect(isPixelUnit(undefined)).toBe(false);
  });
});

// ─── API integration: annotations sync → measurement_points ─────────────────

describe('POST /annotations/sync → measurement_points', () => {
  test('sync creates a measurement point with real unit', async () => {
    const { baselineStudyId, imageId } = await createFixture();
    const res = await sync(imageId, [
      annotation({ data: { handles: { points: [[0, 0, 0], [10, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 25, unit: 'mm' } }, label: 'RNFL 厚度' } }),
    ]);
    expect(res.status).toBe(200);

    const points = await getPointsForStudy(baselineStudyId);
    expect(points).toHaveLength(1);
    expect(points[0].measurementKey).toBe('rnfl');
    expect(points[0].value).toBe(25);
    expect(points[0].unit).toBe('mm');
    expect(points[0].calibrated).toBe(true);
    expect(points[0].imageId).toBe(imageId);
  });

  test('px (uncalibrated) measurements are flagged', async () => {
    const { baselineStudyId, imageId } = await createFixture();
    await sync(imageId, [
      annotation({ data: { handles: { points: [[0, 0, 0], [10, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 50 } }, label: '未校准测量' } }),
    ]);
    const points = await getPointsForStudy(baselineStudyId);
    expect(points).toHaveLength(1);
    expect(points[0].unit).toBe('px');
    expect(points[0].calibrated).toBe(false);
  });

  test('resync same key updates the point (last write wins)', async () => {
    const { baselineStudyId, imageId } = await createFixture();
    await sync(imageId, [
      annotation({ data: { handles: { points: [[0, 0, 0], [10, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 25, unit: 'mm' } }, label: 'RNFL 厚度' } }),
    ]);
    await sync(imageId, [
      annotation({ data: { handles: { points: [[0, 0, 0], [10, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 23.5, unit: 'mm' } }, label: 'RNFL 厚度' } }),
    ]);
    const points = await getPointsForStudy(baselineStudyId);
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(23.5);
  });

  test('empty sync removes the measurement point', async () => {
    const { baselineStudyId, imageId } = await createFixture();
    await sync(imageId, [annotation({})]);
    expect(await getPointsForStudy(baselineStudyId)).toHaveLength(1);
    await sync(imageId, []);
    expect(await getPointsForStudy(baselineStudyId)).toHaveLength(0);
  });

  test('annotation with nonexistent image returns 404 (FK enforced, #118)', async () => {
    const res = await sync('nonexistent-image', [annotation({})]);
    expect(res.status).toBe(404);
  });

  test('two images in the same study → one point per key (last image wins)', async () => {
    const { baselineStudyId } = await createFixture();
    const image2Id = uuid();
    const now = new Date().toISOString();
    const seriesRow = await db.query.series.findFirst({ where: eq(series.studyId, baselineStudyId) });
    await db.insert(images).values({
      id: image2Id,
      seriesId: seriesRow!.id,
      instanceNumber: 2,
      filePath: 'test2.png',
      fileSize: 100,
      fileHash: 'hash2',
      format: 'png',
      width: 512,
      height: 512,
      createdAt: now,
    });
    createdFixtures.push({ patientId: '', baselineStudyId, followupStudyId: '', imageId: image2Id } as any);

    await sync(image2Id, [
      annotation({ data: { handles: { points: [[0, 0, 0], [10, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 30, unit: 'mm' } }, label: 'RNFL 厚度' } }),
    ]);
    const points = await getPointsForStudy(baselineStudyId);
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(30);
  });
});

// ─── Trend query ─────────────────────────────────────────────────────────────

describe('GET /measurements/trends', () => {
  test('groups points by key with studyDate ordering and definition metadata', async () => {
    const { patientId, followupStudyId, imageId } = await createFixture();
    // Baseline: rnfl 25mm (dates 2025-01-10)
    await sync(imageId, [
      annotation({ data: { handles: { points: [[0, 0, 0], [10, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 25, unit: 'mm' } }, label: 'RNFL 厚度' } }),
    ]);
    // Follow-up: same patient, later study (2025-11-02), different image
    const series2 = await db.query.series.findFirst({ where: eq(series.studyId, followupStudyId) });
    const image2Id = uuid();
    const now = new Date().toISOString();
    if (!series2) {
      await db.insert(series).values({
        id: uuid(), studyId: followupStudyId, seriesNumber: 1, modality: 'OCT', imageCount: 1, createdAt: now,
      });
    }
    const seriesRow2 = await db.query.series.findFirst({ where: eq(series.studyId, followupStudyId) });
    await db.insert(images).values({
      id: image2Id, seriesId: seriesRow2!.id, instanceNumber: 1, filePath: 't2.png', fileSize: 1,
      fileHash: 'h', format: 'png', width: 512, height: 512, createdAt: now,
    });
    createdFixtures.push({ patientId: '', baselineStudyId: followupStudyId, followupStudyId: '', imageId: image2Id } as any);
    await sync(image2Id, [
      annotation({ data: { handles: { points: [[0, 0, 0], [10, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 22, unit: 'mm' } }, label: 'RNFL 厚度' } }),
    ]);

    const res = await request(ctx.app, 'GET', `/api/measurements/trends?patientId=${patientId}`, {
      headers: ctx.authHeaders,
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.series).toHaveLength(1);
    const seriesData = data.series[0];
    expect(seriesData.key).toBe('rnfl');
    expect(seriesData.definition.displayName).toBe('RNFL 厚度');
    expect(seriesData.definition.trendDirection).toBe('down');
    expect(seriesData.definition.referenceRange).toEqual({ min: 80 });
    expect(seriesData.points).toHaveLength(2);
    // Order: studyDate ascending
    expect(seriesData.points[0].studyDate).toBe('2025-01-10');
    expect(seriesData.points[0].value).toBe(25);
    expect(seriesData.points[1].studyDate).toBe('2025-11-02');
    expect(seriesData.points[1].value).toBe(22);
  });

  test('requires patientId or studyIds', async () => {
    const res = await request(ctx.app, 'GET', '/api/measurements/trends', { headers: ctx.authHeaders });
    expect(res.status).toBe(400);
  });
});

// ─── CSV export (wayfinder #130) ─────────────────────────────────────────────

describe('GET /measurements/export (CSV)', () => {
  test('returns BOM CSV with patient/study context + definition display name', async () => {
    const { patientId, imageId } = await createFixture();
    await sync(imageId, [
      annotation({ data: { handles: { points: [[0, 0, 0], [10, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 25, unit: 'mm' } }, label: 'RNFL 厚度' } }),
    ]);

    const res = await ctx.app.fetch(
      new Request(`http://localhost/api/measurements/export?patientId=${patientId}`, {
        headers: ctx.authHeaders,
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    const buf = new Uint8Array(await res.arrayBuffer());
    // UTF-8 BOM for Excel compatibility (audit-logs precedent). Note: res.text()
    // strips the BOM via TextDecoder, so assert on the raw bytes instead.
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    const text = new TextDecoder('utf-8').decode(buf.subarray(3));

    // RFC 4180 CRLF line endings (d9e725a 修复) — split on \r\n
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('患者姓名,病历号,检查日期,检查时间,检查类型,测量项,数值,单位,是否校准,测量时间');
    const row = lines[1].split(',');
    expect(row[0]).toBe('测试患者');      // patient name (patients join)
    expect(row[2]).toBe('2025-01-10');    // study date
    expect(row[5]).toBe('RNFL 厚度');     // definition displayName
    expect(row[6]).toBe('25');            // value
    expect(row[7]).toBe('mm');            // unit
    expect(row[8]).toBe('是');            // calibrated
  });

  test('export scoped by studyIds', async () => {
    const { baselineStudyId, imageId } = await createFixture();
    await sync(imageId, [
      annotation({ data: { handles: { points: [[0, 0, 0], [10, 0, 0]] }, cachedStats: { [TARGET_ID]: { length: 25, unit: 'mm' } }, label: 'RNFL 厚度' } }),
    ]);

    const res = await ctx.app.fetch(
      new Request(`http://localhost/api/measurements/export?studyIds=${baselineStudyId}`, {
        headers: ctx.authHeaders,
      })
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.slice(1).split('\n');
    expect(lines).toHaveLength(2); // header + one data row
  });

  test('requires patientId or studyIds', async () => {
    const res = await ctx.app.fetch(
      new Request('http://localhost/api/measurements/export', { headers: ctx.authHeaders })
    );
    expect(res.status).toBe(400);
  });
});

// ─── Dictionary API ──────────────────────────────────────────────────────────

describe('GET /measurements/definitions', () => {
  test('returns preset definitions with reference range and trend direction', async () => {
    const res = await request(ctx.app, 'GET', '/api/measurements/definitions', { headers: ctx.authHeaders });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(Array.isArray(data)).toBe(true);

    const rnfl = data.find((d: any) => d.key === 'rnfl');
    expect(rnfl).toBeDefined();
    expect(rnfl.displayName).toBe('RNFL 厚度');
    expect(rnfl.unit).toBe('μm');
    expect(rnfl.trendDirection).toBe('down');
    expect(rnfl.referenceRange).toEqual({ min: 80 });

    const iop = data.find((d: any) => d.key === 'iop');
    expect(iop).toBeDefined();
    expect(iop.trendDirection).toBe('up');
    expect(iop.referenceRange).toEqual({ min: 10, max: 21 });
  });

  test('GET single definition', async () => {
    const res = await request(ctx.app, 'GET', '/api/measurements/definitions/fovea', { headers: ctx.authHeaders });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.key).toBe('fovea');
    expect(data.unit).toBe('μm');
  });

  test('404 for missing definition', async () => {
    const res = await request(ctx.app, 'GET', '/api/measurements/definitions/does-not-exist', { headers: ctx.authHeaders });
    expect(res.status).toBe(404);
  });

  test('create + update + delete custom definition', async () => {
    const key = `custom_${uuid().slice(0, 8)}`;
    const createRes = await request(ctx.app, 'POST', '/api/measurements/definitions', {
      headers: ctx.authHeaders,
      body: {
        key,
        displayName: '自定义测量',
        type: 'other',
        unit: 'mm',
        trendDirection: 'up',
        referenceRange: { min: 1, max: 10 },
      },
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data;
    expect(created.key).toBe(key);

    // duplicate key rejected
    const dupRes = await request(ctx.app, 'POST', '/api/measurements/definitions', {
      headers: ctx.authHeaders,
      body: { key, displayName: '重复', type: 'other', unit: 'mm', trendDirection: 'up' },
    });
    expect(dupRes.status).toBe(400);

    // update display name
    const updRes = await request(ctx.app, 'PUT', `/api/measurements/definitions/${key}`, {
      headers: ctx.authHeaders,
      body: { displayName: '自定义测量V2', referenceRange: { max: 8 } },
    });
    expect(updRes.status).toBe(200);
    const updated = (await updRes.json()).data;
    expect(updated.displayName).toBe('自定义测量V2');
    expect(updated.referenceRange).toEqual({ max: 8 });

    const delRes = await request(ctx.app, 'DELETE', `/api/measurements/definitions/${key}`, {
      headers: ctx.authHeaders,
    });
    expect(delRes.status).toBe(200);

    const after = await request(ctx.app, 'GET', `/api/measurements/definitions/${key}`, { headers: ctx.authHeaders });
    expect(after.status).toBe(404);
  });
});
