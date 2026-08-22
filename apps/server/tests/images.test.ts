/**
 * Image Serving Regression Tests.
 *
 * Regression 1: GET /api/images/:id/file?format=dicom returned 500 for
 * placeholder image records whose backing file does not exist on disk.
 * (db/seed.ts inserts placeholder records without writing files; the
 * on-the-fly DICOM conversion path read the file directly and threw ENOENT,
 * unlike every other file-serving path that honors the dev fallback.)
 *
 * Regression 2: GET /api/dicomweb/images/:id/frames 404'd because the
 * frontend calls /api/dicomweb/... while the router was only mounted at
 * /dicomweb (the axios client's baseURL is /api, so both inline fetches and
 * dicomwebApi.getFrames hit the wrong mount).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createTestApp, request } from './helpers';
import { db, images, patients, series, studies } from '../src/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

// Self-contained fixture chain: patient → study → series → image.
// The image record points at a file that is intentionally never written —
// mirrors the seed-created placeholder records (e.g. b26e531a-…).
const fixture = {
  patientId: uuid(),
  studyId: uuid(),
  seriesId: uuid(),
  imageId: uuid(),
};

beforeAll(async () => {
  ctx = await createTestApp();

  await db.insert(patients).values({
    id: fixture.patientId,
    mrn: `REG-${fixture.patientId.slice(0, 8)}`,
    name: 'Regression Test Patient',
    gender: 'other',
  });

  await db.insert(studies).values({
    id: fixture.studyId,
    patientId: fixture.patientId,
    studyDate: '2026-08-15',
  });

  await db.insert(series).values({
    id: fixture.seriesId,
    studyId: fixture.studyId,
    seriesNumber: 1,
    modality: 'OT',
  });

  await db.insert(images).values({
    id: fixture.imageId,
    seriesId: fixture.seriesId,
    instanceNumber: 9999,
    filePath: `${fixture.imageId}.png`, // file intentionally never written
    fileSize: 0,
    fileHash: `regression_${fixture.imageId}`,
    format: 'png',
    width: 512,
    height: 512,
  });
});

afterAll(async () => {
  await db.delete(images).where(eq(images.id, fixture.imageId));
  await db.delete(series).where(eq(series.id, fixture.seriesId));
  await db.delete(studies).where(eq(studies.id, fixture.studyId));
  await db.delete(patients).where(eq(patients.id, fixture.patientId));
  ctx.cleanup();
});

describe('GET /api/images/:id/file?format=dicom with missing backing file', () => {
  test('serves fallback DICOM instead of 500', async () => {
    const res = await ctx.app.fetch(
      new Request(`http://localhost/api/images/${fixture.imageId}/file?format=dicom`, {
        headers: ctx.authHeaders,
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/dicom');
    // Fallback was used (same contract as serveFileOrFallback)
    expect(res.headers.get('X-Dev-Fallback')).toBe('true');

    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(128);
    // DICOM Part 10 preamble magic at byte 128
    expect(buf.subarray(128, 132).toString('ascii')).toBe('DICM');
  });
});

describe('dicomweb frames endpoint', () => {
  test('GET /api/dicomweb/images/:id/frames returns 200 (dual mount)', async () => {
    const res = await ctx.app.fetch(
      new Request(`http://localhost/api/dicomweb/images/${fixture.imageId}/frames`, {
        headers: ctx.authHeaders,
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { numberOfFrames: number };
    expect(body.numberOfFrames).toBe(1);
  });
});

// Sanity: keep the helpers import used so the request() signature stays tied
// to the shared harness.
describe('unauthenticated guard', () => {
  test('GET /api/images/:id/file returns 401 without auth', async () => {
    const res = await request(ctx.app, 'GET', `/api/images/${fixture.imageId}/file`);
    expect(res.status).toBe(401);
  });
});

// ── Upload chain (wayfinder #131) ───────────────────────────────────────────
// POST /api/images/upload accepts studyId (auto-creates a Series) or seriesId
// (appends); /upload/batch stores multiple files into one series.
const { join: pathJoin } = await import('node:path');

// 1x1 PNG that sharp can process (metadata + thumbnail).
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const uploadFixture = {
  patientId: uuid(),
  studyId: uuid(),
  imageIds: [] as string[],
  seriesIds: [] as string[],
};

function uploadForm(opts: { name?: string; studyId?: string; seriesId?: string; extra?: Record<string, string> }) {
  const form = new FormData();
  form.append('file', new File([TINY_PNG], opts.name || 'test.png', { type: 'image/png' }));
  if (opts.studyId) form.append('studyId', opts.studyId);
  if (opts.seriesId) form.append('seriesId', opts.seriesId);
  for (const [k, v] of Object.entries(opts.extra || {})) form.append(k, v);
  return form;
}

describe('POST /api/images/upload — upload chain (wayfinder #131)', () => {
  beforeAll(async () => {
    await db.insert(patients).values({
      id: uploadFixture.patientId,
      mrn: `UPL-${uploadFixture.patientId.slice(0, 8)}`,
      name: 'Upload Test Patient',
      gender: 'other',
    });
    await db.insert(studies).values({
      id: uploadFixture.studyId,
      patientId: uploadFixture.patientId,
      studyDate: '2026-09-01',
      modality: 'OCT',
    });
  });

  afterAll(async () => {
    const uploadDir = pathJoin(process.cwd(), 'data', 'images');

    // Remove uploaded files + DB records (files live under gitignored data/)
    for (const id of uploadFixture.imageIds) {
      const rec = await db.query.images.findFirst({ where: eq(images.id, id) });
      if (rec) {
        for (const p of [rec.filePath, rec.thumbnailPath]) {
          if (p) {
            try {
              await Bun.file(pathJoin(uploadDir, p)).delete();
            } catch {
              // already gone
            }
          }
        }
      }
      await db.delete(images).where(eq(images.id, id));
    }
    for (const id of uploadFixture.seriesIds) {
      await db.delete(series).where(eq(series.id, id));
    }
    await db.delete(studies).where(eq(studies.id, uploadFixture.studyId));
    await db.delete(patients).where(eq(patients.id, uploadFixture.patientId));
  });

  test('upload with studyId creates a Series + Image', async () => {
    const res = await ctx.app.fetch(
      new Request('http://localhost/api/images/upload', {
        method: 'POST',
        headers: ctx.authHeaders,
        body: uploadForm({ studyId: uploadFixture.studyId, extra: { modality: 'OCT' } }),
      })
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    const image = body.data;
    expect(image).toBeTruthy();
    expect(image.format).toBe('png');
    expect(image.instanceNumber).toBe(1);
    expect(image.seriesId).toBeTruthy();

    uploadFixture.imageIds.push(image.id);
    uploadFixture.seriesIds.push(image.seriesId);

    // Series was auto-created under the study with the provided modality
    const createdSeries = await db.query.series.findFirst({ where: eq(series.id, image.seriesId) });
    expect(createdSeries).toBeTruthy();
    expect(createdSeries!.studyId).toBe(uploadFixture.studyId);
    expect(createdSeries!.modality).toBe('OCT');
    expect(createdSeries!.imageCount).toBe(1);

    // The uploaded file is servable through the viewer loading path
    const fileRes = await ctx.app.fetch(
      new Request(`http://localhost/api/images/${image.id}/file`, { headers: ctx.authHeaders })
    );
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers.get('Content-Type')).toBe('image/png');
  });

  test('second upload without seriesId appends to the same series', async () => {
    const res = await ctx.app.fetch(
      new Request('http://localhost/api/images/upload', {
        method: 'POST',
        headers: ctx.authHeaders,
        body: uploadForm({ studyId: uploadFixture.studyId }),
      })
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    const image = body.data;
    uploadFixture.imageIds.push(image.id);
    expect(uploadFixture.seriesIds).toContain(image.seriesId);
    expect(image.instanceNumber).toBe(2); // auto-incremented
  });

  test('createSeries=1 forces a new series', async () => {
    const res = await ctx.app.fetch(
      new Request('http://localhost/api/images/upload', {
        method: 'POST',
        headers: ctx.authHeaders,
        body: uploadForm({ studyId: uploadFixture.studyId, extra: { createSeries: '1', modality: 'FFA' } }),
      })
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    const image = body.data;
    uploadFixture.imageIds.push(image.id);
    uploadFixture.seriesIds.push(image.seriesId);
    expect(uploadFixture.seriesIds.filter((s) => s === image.seriesId).length).toBe(1);
    const createdSeries = await db.query.series.findFirst({ where: eq(series.id, image.seriesId) });
    expect(createdSeries!.modality).toBe('FFA');
    expect(createdSeries!.seriesNumber).toBe(2);
  });

  test('rejects unsupported formats (webp)', async () => {
    const form = new FormData();
    form.append('file', new File([TINY_PNG], 'photo.webp', { type: 'image/webp' }));
    form.append('studyId', uploadFixture.studyId);

    const res = await ctx.app.fetch(
      new Request('http://localhost/api/images/upload', {
        method: 'POST',
        headers: ctx.authHeaders,
        body: form,
      })
    );
    expect(res.status).toBe(400);
  });

  test('rejects upload without seriesId or studyId', async () => {
    const res = await ctx.app.fetch(
      new Request('http://localhost/api/images/upload', {
        method: 'POST',
        headers: ctx.authHeaders,
        body: uploadForm({}),
      })
    );
    expect(res.status).toBe(400);
  });

  test('rejects nonexistent seriesId', async () => {
    const res = await ctx.app.fetch(
      new Request('http://localhost/api/images/upload', {
        method: 'POST',
        headers: ctx.authHeaders,
        body: uploadForm({ seriesId: 'missing-series' }),
      })
    );
    expect(res.status).toBe(404);
  });

  test('batch upload stores multiple files into one series', async () => {
    const form = new FormData();
    form.append('file', new File([TINY_PNG], 'a.png', { type: 'image/png' }));
    form.append('file', new File([TINY_PNG], 'b.png', { type: 'image/png' }));
    form.append('studyId', uploadFixture.studyId);
    form.append('createSeries', '1');
    form.append('modality', 'VF');

    const res = await ctx.app.fetch(
      new Request('http://localhost/api/images/upload/batch', {
        method: 'POST',
        headers: ctx.authHeaders,
        body: form,
      })
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    const { seriesId, items } = body.data;
    expect(items.length).toBe(2);
    expect(items[0].instanceNumber).toBe(1);
    expect(items[1].instanceNumber).toBe(2);
    expect(items[0].seriesId).toBe(items[1].seriesId);
    uploadFixture.imageIds.push(items[0].id, items[1].id);
    uploadFixture.seriesIds.push(seriesId);

    const createdSeries = await db.query.series.findFirst({ where: eq(series.id, seriesId) });
    expect(createdSeries!.imageCount).toBe(2);
  });
});
