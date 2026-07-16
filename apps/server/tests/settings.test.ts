/**
 * Settings API Tests — system configuration management.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createTestApp, request } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(() => {
  ctx.cleanup();
});

describe('Settings API', () => {
  const headers = () => ({ Authorization: 'Bearer test' });

  test('health check — server responds', async () => {
    const res = await request(ctx.app, 'GET', '/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  test('PUT /api/settings/dicom/ae_title — returns 401 without auth', async () => {
    const res = await request(ctx.app, 'PUT', '/api/settings/dicom/ae_title', {
      body: { value: 'TEST_PACS' },
    });
    // Should be 401 (unauthorized) since we don't have valid auth
    expect(res.status).toBe(401);
  });

  test('GET /api/settings — returns 401 without auth', async () => {
    const res = await request(ctx.app, 'GET', '/api/settings');
    expect(res.status).toBe(401);
  });
});
