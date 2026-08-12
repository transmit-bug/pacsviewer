/**
 * Annotation Sync Contract Tests — POST /api/annotations/sync
 *
 * Verifies the Cornerstone serialization contract:
 *   - Valid payloads are persisted and round-trip via GET /annotations/image/:id
 *   - Malformed payloads are rejected with 400 and a reason
 *   - Sync replaces all annotations for an image (last write wins)
 */

import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { createTestApp, request } from './helpers';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { db, annotations } from '../src/db';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

// imageIds created by tests, cleaned up after each test
const createdImageIds: string[] = [];

const TARGET_ID = 'wadouri:http://localhost:3000/api/images/img-1/file';

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(() => {
  ctx.cleanup();
});

afterEach(async () => {
  // Clean up rows created by this test (tests run against the shared dev DB)
  for (const imageId of createdImageIds.splice(0)) {
    await db.delete(annotations).where(eq(annotations.imageId, imageId));
  }
});

function newImageId(): string {
  const id = `test-image-${uuid()}`;
  createdImageIds.push(id);
  return id;
}

function validAnnotation(overrides: Record<string, any> = {}) {
  return {
    id: uuid(),
    toolName: 'Length',
    data: {
      handles: {
        points: [
          [10, 20, 0],
          [30, 40, 0],
        ],
      },
      cachedStats: {
        [TARGET_ID]: { length: 25, unit: 'mm', statsArray: [] },
      },
      label: '黄斑中心凹',
    },
    style: { color: '#ffff00', lineWidth: 2 },
    ...overrides,
  };
}

async function sync(imageId: string, payloadAnnotations: any[], headers?: Record<string, string>) {
  return request(ctx.app, 'POST', '/api/annotations/sync', {
    body: { imageId, annotations: payloadAnnotations },
    headers: headers ?? ctx.authHeaders,
  });
}

async function syncRaw(body: any, headers?: Record<string, string>) {
  return request(ctx.app, 'POST', '/api/annotations/sync', {
    body,
    headers: headers ?? ctx.authHeaders,
  });
}

async function getByImage(imageId: string, headers?: Record<string, string>) {
  return request(ctx.app, 'GET', `/api/annotations/image/${imageId}`, {
    headers: headers ?? ctx.authHeaders,
  });
}

describe('POST /api/annotations/sync — contract validation', () => {
  test('rejects malformed payload with 400 and a reason', async () => {
    const cases: Array<{ name: string; body: any }> = [
      { name: 'missing imageId', body: { annotations: [validAnnotation()] } },
      { name: 'non-string imageId', body: { imageId: 123, annotations: [] } },
      { name: 'annotations not array', body: { imageId: newImageId(), annotations: {} } },
      { name: 'annotation is null', body: { imageId: newImageId(), annotations: [null] } },
      { name: 'annotation is string', body: { imageId: newImageId(), annotations: ['Length'] } },
      { name: 'annotation is array', body: { imageId: newImageId(), annotations: [[]] } },
      { name: 'missing toolName', body: { imageId: newImageId(), annotations: [validAnnotation({ toolName: undefined })] } },
      { name: 'empty toolName', body: { imageId: newImageId(), annotations: [validAnnotation({ toolName: '  ' })] } },
      { name: 'missing data', body: { imageId: newImageId(), annotations: [validAnnotation({ data: undefined })] } },
      { name: 'missing handles', body: { imageId: newImageId(), annotations: [validAnnotation({ data: { points: [] } })] } },
      { name: 'empty points', body: { imageId: newImageId(), annotations: [validAnnotation({ data: { handles: { points: [] } } })] } },
      { name: 'bad point shape', body: { imageId: newImageId(), annotations: [validAnnotation({ data: { handles: { points: ['abc'] } } })] } },
      { name: 'cachedStats not object', body: { imageId: newImageId(), annotations: [validAnnotation({ data: { handles: { points: [[1, 2, 3]] }, cachedStats: 'nope' } })] } },
      { name: 'id not string', body: { imageId: newImageId(), annotations: [validAnnotation({ id: 42 })] } },
    ];

    for (const tc of cases) {
      const imageId = typeof tc.body.imageId === 'string' ? tc.body.imageId : newImageId();
      const res = await syncRaw(tc.body);
      expect(res.status, tc.name).toBe(400);
      const data = await res.json();
      expect(data.success, tc.name).toBe(false);
      expect(typeof data.message, tc.name).toBe('string');
      expect(data.message.length, tc.name).toBeGreaterThan(0);
    }
  });

  test('valid single annotation → 200 and count 1', async () => {
    const imageId = newImageId();
    const ann = validAnnotation();
    const res = await sync(imageId, [ann]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data).toEqual({ imageId, count: 1 });
  });

  test('valid mixed-tool annotations → 200 and count N', async () => {
    const imageId = newImageId();
    const anns = [
      validAnnotation({ toolName: 'Length' }),
      validAnnotation({
        toolName: 'Angle',
        data: {
          handles: { points: [[0, 0, 0], [5, 0, 0], [5, 5, 0]] },
          cachedStats: { [TARGET_ID]: { angle: 45 } },
        },
      }),
      validAnnotation({
        toolName: 'EllipticalROI',
        data: {
          handles: { points: [[0, 0, 0], [10, 5, 0]] },
          cachedStats: { [TARGET_ID]: { area: 157, areaUnit: 'mm²' } },
        },
      }),
    ];
    const res = await sync(imageId, anns);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.count).toBe(3);
  });

  test('empty array clears all annotations for the image', async () => {
    const imageId = newImageId();
    await sync(imageId, [validAnnotation()]);
    const res = await sync(imageId, []);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.count).toBe(0);
  });
});

describe('POST /api/annotations/sync — round-trip fidelity', () => {
  test('GET /annotations/image/:id returns stored toolName/handles/cachedStats verbatim', async () => {
    const imageId = newImageId();
    const ann = validAnnotation();
    const resSync = await sync(imageId, [ann]);
    expect(resSync.status).toBe(200);

    const resGet = await getByImage(imageId);
    expect(resGet.status).toBe(200);
    const { data } = await resGet.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(ann.id);
    expect(data[0].toolName).toBe('Length');
    expect(data[0].data.handles).toEqual(ann.data.handles);
    expect(data[0].data.cachedStats).toEqual(ann.data.cachedStats);
    expect(data[0].data.label).toBe('黄斑中心凹');
    expect(data[0].style).toEqual(ann.style);
  });

  test('sync replaces previous annotations (last write wins)', async () => {
    const imageId = newImageId();
    const first = validAnnotation({ id: 'first-uid', toolName: 'Length' });
    const second = validAnnotation({
      id: 'second-uid',
      toolName: 'Angle',
      data: {
        handles: { points: [[1, 2, 3], [4, 5, 6]] },
        cachedStats: { [TARGET_ID]: { angle: 90 } },
      },
    });

    await sync(imageId, [first]);
    await sync(imageId, [second]);

    const resGet = await getByImage(imageId);
    const { data } = await resGet.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('second-uid');
    expect(data[0].toolName).toBe('Angle');
    expect(data[0].data.cachedStats[TARGET_ID].angle).toBe(90);
  });
});

describe('POST /api/annotations/sync — auth', () => {
  test('returns 401 without valid token', async () => {
    const res = await sync(newImageId(), [validAnnotation()], {});
    expect(res.status).toBe(401);
  });
});
