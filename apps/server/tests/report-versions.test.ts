/**
 * Report Versions API Tests
 *
 * Tests for report version creation, retrieval, and diff functionality.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { createTestApp, request } from './helpers';
import { v4 as uuid } from 'uuid';
import * as schema from '../src/db/schema';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let testPatientId: string;
let testStudyId: string;
let testReportId: string;
let testTemplateId: string;

beforeAll(async () => {
  ctx = await createTestApp();

  // Seed: patient, study, report template, report
  testPatientId = uuid();
  testStudyId = uuid();
  testTemplateId = uuid();
  testReportId = uuid();
  const now = new Date().toISOString();
  const uniqueSuffix = testPatientId.slice(0, 8);

  await ctx.db.insert(schema.patients).values({
    id: testPatientId,
    mrn: `MRN-${uniqueSuffix}`,
    name: 'Test Patient',
    gender: 'male',
    birthDate: '1990-01-01',
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert(schema.studies).values({
    id: testStudyId,
    patientId: testPatientId,
    studyDate: '2024-01-15',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert(schema.reportTemplates).values({
    id: testTemplateId,
    name: 'OCT Report',
    type: 'oct',
    fields: JSON.stringify([]),
    layout: JSON.stringify({}),
    isSystem: true,
    createdBy: ctx.adminId,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert(schema.reports).values({
    id: testReportId,
    studyId: testStudyId,
    patientId: testPatientId,
    templateId: testTemplateId,
    title: 'Test Report',
    content: JSON.stringify({ findings: 'Normal' }),
    status: 'draft',
    createdBy: ctx.adminId,
    createdAt: now,
    updatedAt: now,
  });
});

afterAll(() => {
  ctx.cleanup();
});

describe('Report Versions API', () => {
  describe('GET /api/reports/:id/versions', () => {
    test('returns empty array when no versions exist', async () => {
      const res = await request(ctx.app, 'GET', `/api/reports/${testReportId}/versions`, {
        headers: ctx.authHeaders,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });

    test('returns versions after status change creates one', async () => {
      // PUT /:id/status should create a version
      const putRes = await request(ctx.app, 'PUT', `/api/reports/${testReportId}/status`, {
        headers: ctx.authHeaders,
        body: { status: 'pending_review', reviewNotes: 'Ready for review' },
      });

      expect(putRes.status).toBe(200);

      // Now fetch versions
      const res = await request(ctx.app, 'GET', `/api/reports/${testReportId}/versions`, {
        headers: ctx.authHeaders,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].version).toBe(1);
      expect(body.data[0].status).toBe('draft'); // saved the previous status
      expect(body.data[0].changeNotes).toBe('Ready for review');
    });
  });

  describe('GET /api/reports/:id/versions/:version', () => {
    test('returns specific version', async () => {
      const res = await request(ctx.app, 'GET', `/api/reports/${testReportId}/versions/1`, {
        headers: ctx.authHeaders,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.version).toBe(1);
      expect(body.data.reportId).toBe(testReportId);
    });

    test('returns 404 for non-existent version', async () => {
      const res = await request(ctx.app, 'GET', `/api/reports/${testReportId}/versions/999`, {
        headers: ctx.authHeaders,
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('Version creation on status change', () => {
    test('creates multiple versions on successive status changes', async () => {
      // Change to reviewed
      await request(ctx.app, 'PUT', `/api/reports/${testReportId}/status`, {
        headers: ctx.authHeaders,
        body: { status: 'reviewed', reviewNotes: 'Looks good' },
      });

      // Change to published
      await request(ctx.app, 'PUT', `/api/reports/${testReportId}/status`, {
        headers: ctx.authHeaders,
        body: { status: 'published', reviewNotes: 'Approved for publication' },
      });

      // Fetch all versions
      const res = await request(ctx.app, 'GET', `/api/reports/${testReportId}/versions`, {
        headers: ctx.authHeaders,
      });

      const body = await res.json();
      expect(body.data.length).toBe(3); // draft, pending_review, reviewed
      expect(body.data[0].version).toBe(3); // sorted desc
      expect(body.data[2].version).toBe(1);
    });
  });

  describe('GET /api/reports/:id/versions/diff', () => {
    test('returns diff between two versions', async () => {
      // First update the report content
      await request(ctx.app, 'PUT', `/api/reports/${testReportId}`, {
        headers: ctx.authHeaders,
        body: {
          content: { findings: 'Abnormal', diagnosis: 'Requires treatment' },
        },
      });

      // Create another version via status change
      await request(ctx.app, 'PUT', `/api/reports/${testReportId}/status`, {
        headers: ctx.authHeaders,
        body: { status: 'published', reviewNotes: 'Updated content' },
      });

      // Get diff between v1 and latest
      const res = await request(
        ctx.app,
        'GET',
        `/api/reports/${testReportId}/versions/diff?v1=1&v2=4`,
        { headers: ctx.authHeaders }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.from.version).toBe(1);
      expect(body.data.to.version).toBe(4);
      expect(body.data.diff).toBeDefined();
    });

    test('returns 400 when missing v1 or v2', async () => {
      const res = await request(
        ctx.app,
        'GET',
        `/api/reports/${testReportId}/versions/diff?v1=1`,
        { headers: ctx.authHeaders }
      );

      expect(res.status).toBe(400);
    });
  });
});
