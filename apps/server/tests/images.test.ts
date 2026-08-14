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
import { db, images } from '../src/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
const fixtureImageId = uuid();

beforeAll(async () => {
  ctx = await createTestApp();

  // Insert a placeholder image record whose backing file does NOT exist on
  // disk — mirrors the seed-created placeholder records (e.g. b26e531a-…).
  await db.insert(images).values({
    id: fixtureImageId,
    seriesId: '04409f55-7b7e-4454-a4a9-bc67744f86a3', // existing series in dev DB
    instanceNumber: 9999,
    filePath: `${fixtureImageId}.png`, // file intentionally never written
    fileSize: 0,
    fileHash: `regression_${fixtureImageId}`,
    format: 'png',
    width: 512,
    height: 512,
  });
});

afterAll(async () => {
  await db.delete(images).where(eq(images.id, fixtureImageId));
  ctx.cleanup();
});

describe('GET /api/images/:id/file?format=dicom with missing backing file', () => {
  test('serves fallback DICOM instead of 500', async () => {
    const res = await ctx.app.fetch(
      new Request(`http://localhost/api/images/${fixtureImageId}/file?format=dicom`, {
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
      new Request(`http://localhost/api/dicomweb/images/${fixtureImageId}/frames`, {
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
    const res = await request(ctx.app, 'GET', `/api/images/${fixtureImageId}/file`);
    expect(res.status).toBe(401);
  });
});
