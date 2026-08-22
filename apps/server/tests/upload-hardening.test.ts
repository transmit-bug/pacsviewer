/**
 * Upload hardening endpoint tests (#136 决议：手动导入 1.0 试点).
 *
 * - Per-file 100MB cap enforced server-side BEFORE processing (/upload, /upload-dicom).
 * - Batch failure policy: skip failed files, continue, per-file report —
 *   one unsupported/oversized file must NOT abort the batch.
 *
 * Pure validation logic (caps, whitelist, partitioning) is covered in
 * upload-validation.test.ts; this file exercises the HTTP layer.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createTestApp } from './helpers';
import { db, images, patients, series, studies } from '../src/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { join as pathJoin } from 'node:path';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

// 1x1 PNG that sharp can process (metadata + thumbnail).
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const fixture = {
  patientId: uuid(),
  studyId: uuid(),
  imageIds: [] as string[],
  seriesIds: [] as string[],
};

beforeAll(async () => {
  ctx = await createTestApp();

  await db.insert(patients).values({
    id: fixture.patientId,
    mrn: `HRD-${fixture.patientId.slice(0, 8)}`,
    name: 'Upload Hardening Patient',
    gender: 'other',
  });
  await db.insert(studies).values({
    id: fixture.studyId,
    patientId: fixture.patientId,
    studyDate: '2026-09-01',
    modality: 'OCT',
  });
});

afterAll(async () => {
  const uploadDir = pathJoin(process.cwd(), 'data', 'images');

  for (const id of fixture.imageIds) {
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
  for (const id of fixture.seriesIds) {
    await db.delete(series).where(eq(series.id, id));
  }
  await db.delete(studies).where(eq(studies.id, fixture.studyId));
  await db.delete(patients).where(eq(patients.id, fixture.patientId));
  ctx.cleanup();
});

function post(path: string, form: FormData) {
  return ctx.app.fetch(new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: ctx.authHeaders,
    body: form,
  }));
}

describe('per-file 100MB cap (#136)', () => {
  test('/upload rejects oversized files with a Chinese error before processing', async () => {
    const oversized = new File(
      [new ArrayBuffer(100 * 1024 * 1024 + 1)],
      'big.png',
      { type: 'image/png' }
    );
    const form = new FormData();
    form.append('file', oversized);
    form.append('studyId', fixture.studyId);

    const res = await post('/api/images/upload', form);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.message).toContain('100MB');
  });

  test('/upload-dicom rejects oversized files before parsing', async () => {
    const oversized = new File(
      [new ArrayBuffer(100 * 1024 * 1024 + 1)],
      'big.dcm',
      { type: 'application/dicom' }
    );
    const form = new FormData();
    form.append('file', oversized);

    const res = await post('/api/images/upload-dicom', form);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.message).toContain('100MB');
  });
});

describe('batch skip-and-continue (#136 批量失败策略)', () => {
  test('skips unsupported files and reports them per file', async () => {
    const form = new FormData();
    form.append('file', new File([TINY_PNG], 'good-1.png', { type: 'image/png' }));
    form.append('file', new File([TINY_PNG], 'bad.webp', { type: 'image/webp' }));
    form.append('file', new File([TINY_PNG], 'good-2.jpg', { type: 'image/jpeg' }));
    form.append('studyId', fixture.studyId);
    form.append('createSeries', '1');
    form.append('modality', 'OCT');

    const res = await post('/api/images/upload/batch', form);

    // The batch succeeds despite one unsupported file (#136 skip-and-continue).
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    const { items, failed } = body.data;

    // Only the two valid files were stored...
    expect(items.length).toBe(2);
    expect(items.map((i: any) => i.format).sort()).toEqual(['jpeg', 'png']);
    expect(items[0].seriesId).toBe(items[1].seriesId);
    fixture.imageIds.push(...items.map((i: any) => i.id));
    fixture.seriesIds.push(items[0].seriesId);

    // ...with an accurate per-file failure report for the rest.
    expect(failed.length).toBe(1);
    expect(failed[0].fileName).toBe('bad.webp');
    expect(failed[0].reason).toContain('不支持的文件格式');
  });

  test('batch with zero valid files returns 400 listing the reasons', async () => {
    const form = new FormData();
    form.append('file', new File([TINY_PNG], 'bad.webp', { type: 'image/webp' }));
    form.append('file', new File([TINY_PNG], 'worse.gif', { type: 'image/gif' }));
    form.append('studyId', fixture.studyId);

    const res = await post('/api/images/upload/batch', form);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.message).toContain('不支持的文件格式');
  });

  test('oversized file inside a batch is skipped without aborting valid ones', async () => {
    const form = new FormData();
    form.append('file', new File([new ArrayBuffer(100 * 1024 * 1024 + 1)], 'huge.png'));
    form.append('file', new File([TINY_PNG], 'ok.png', { type: 'image/png' }));
    form.append('studyId', fixture.studyId);
    form.append('createSeries', '1');

    const res = await post('/api/images/upload/batch', form);
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    const { items, failed } = body.data;

    expect(items.length).toBe(1);
    expect(items[0].filePath).toBeTruthy();
    fixture.imageIds.push(items[0].id);
    fixture.seriesIds.push(items[0].seriesId);

    expect(failed.length).toBe(1);
    expect(failed[0].fileName).toBe('huge.png');
    expect(failed[0].reason).toContain('100MB');
  });
});
