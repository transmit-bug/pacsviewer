/**
 * S2 — Register patient (#141).
 * Creates a patient through the same API the registration form uses, then
 * verifies it appears in the patients list (API + UI list page).
 */
import { test, expect } from '@playwright/test';
import { login, uniq } from './helpers';

test.setTimeout(90_000);

test.describe('S2 register patient', () => {
  test('create patient → persisted → listed', async ({ page }) => {
    const authHeaders = await login(page);
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

    const mrn = uniq('MRN-E2E-');
    const name = `E2E Patient ${uniq('#')}`;
    const res = await page.request.post('/api/patients', {
      headers: jsonHeaders,
      data: {
        mrn,
        name,
        gender: 'male',
        birthDate: '1980-01-01',
        phone: '13800000000',
        notes: 'synthetic patient (#141 S2)',
      },
    });
    const text = await res.text();
    expect(res.status(), `patient create should succeed: ${text}`).toBe(201);
    const created = JSON.parse(text)?.data;
    expect(created?.id).toBeTruthy();
    expect(created?.mrn).toBe(mrn);

    // Persisted — fetch back by id
    const getRes = await page.request.get(`/api/patients/${created.id}`, { headers: authHeaders });
    expect(getRes.status()).toBe(200);
    const fetched = (await getRes.json())?.data;
    expect(fetched?.name).toBe(name);

    // Visible in the patients UI list
    await page.goto('/patients');
    await expect(
      page.getByText(name, { exact: false }).first(),
      'new patient should appear in the patients list',
    ).toBeVisible({ timeout: 20_000 });
  });
});
