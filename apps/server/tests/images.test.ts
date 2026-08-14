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
