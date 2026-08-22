/**
 * S6 — Report lifecycle (#141): create → edit → sign.
 *
 * Signing drives the status machine draft → pending_review → reviewed →
 * published (apps/server/src/routes/reports.ts PUT /:id/status); when status
 * becomes 'published' the server stamps publishedAt. Asserted via the API.
 */
import { test, expect } from '@playwright/test';
import { login, uniq } from './helpers';

test.setTimeout(120_000);

async function postJson(page: import('@playwright/test').APIRequestContext, url: string, headers: Record<string, string>, data: unknown) {
  return page.request.post(url, { headers: { ...headers, 'Content-Type': 'application/json' }, data });
}

test.describe('S6 report create → edit → sign', () => {
  test('signing publishes the report and stamps publishedAt', async ({ page }) => {
    const authHeaders = await login(page);
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

    // Arrange: patient + study
    const patientRes = await postJson(page, '/api/patients', authHeaders, {
      mrn: uniq('MRN-E2E-'),
      name: `E2E Report ${uniq('')}`,
      gender: 'female',
    });
    expect(patientRes.status()).toBe(201);
    const patient = (await patientRes.json())?.data;

    const studyRes = await postJson(page, '/api/studies', authHeaders, {
      patientId: patient.id,
      studyDate: new Date().toISOString().slice(0, 10),
      modality: 'OCT',
      description: 'E2E report study (#141 S6)',
    });
    expect(studyRes.status()).toBe(201);
    const study = (await studyRes.json())?.data;

    // A seeded report template (seed creates 6)
    const tplRes = await page.request.get('/api/report-templates?pageSize=10', { headers: authHeaders });
    expect(tplRes.status()).toBe(200);
    const templates = (await tplRes.json())?.data?.items ?? (await tplRes.json())?.data ?? [];
    expect(templates.length, 'seed should contain report templates').toBeGreaterThan(0);

    // Create draft report
    const createRes = await postJson(page, '/api/reports', authHeaders, {
      patientId: patient.id,
      studyId: study.id,
      templateId: templates[0].id,
      title: `E2E Report ${uniq('#')}`,
      content: { conclusion: 'synthetic finding (#141 S6)' },
      status: 'draft',
    });
    const createText = await createRes.text();
    expect(createRes.status(), `report create should succeed: ${createText}`).toBe(201);
    const report = JSON.parse(createText)?.data;
    expect(report?.id).toBeTruthy();

    // Edit content (crud router exposes PUT /:id, no PATCH)
    const editRes = await page.request.put(`/api/reports/${report.id}`, {
      headers: jsonHeaders,
      data: { title: `${report.title} (edited)`, content: { conclusion: 'edited synthetic finding' } },
    });
    expect(editRes.status(), `report edit should succeed: ${await editRes.text()}`).toBeLessThan(400);

    // Walk the status machine to signing
    for (const status of ['pending_review', 'reviewed', 'published']) {
      const stRes = await page.request.put(`/api/reports/${report.id}/status`, {
        headers: jsonHeaders,
        data: { status },
      });
      const stText = await stRes.text();
      expect(stRes.status(), `status transition to ${status} should succeed: ${stText}`).toBeLessThan(400);
    }

    // Sign-off assertion: status === 'published' AND publishedAt stamped
    const finalRes = await page.request.get(`/api/reports/${report.id}`, { headers: authHeaders });
    expect(finalRes.status()).toBe(200);
    const finalReport = (await finalRes.json())?.data;
    expect(finalReport?.status).toBe('published');
    expect(finalReport?.publishedAt, 'publishedAt must be written on sign').toBeTruthy();
  });
});
