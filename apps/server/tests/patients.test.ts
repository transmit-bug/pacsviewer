/**
 * Patient API Tests — CRUD operations.
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

describe('Patient API (unauthenticated)', () => {
  test('GET /api/patients — returns 401 without auth', async () => {
    const res = await request(ctx.app, 'GET', '/api/patients');
    expect(res.status).toBe(401);
  });

  test('POST /api/patients — returns 401 without auth', async () => {
    const res = await request(ctx.app, 'POST', '/api/patients', {
      body: { mrn: 'TEST-001', name: 'Test', gender: 'male', birthDate: '1990-01-01' },
    });
    expect(res.status).toBe(401);
  });
});
