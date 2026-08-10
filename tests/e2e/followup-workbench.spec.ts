/**
 * E2E Test — Follow-up workbench loop (tickets T2/T3/T4/T5: #100 #101 #102 #103).
 *
 * Flow: Login → discover a seeded patient with ≥2 same-modality studies →
 * sync an "RNFL 厚度" measurement onto both studies' images (feeds
 * measurement_points) → open the comparison workbench → verify study
 * selectors + canvases → save 随访记录 (delta table appears) → patient detail
 * timeline lists the record → trend tab renders the facet chart with
 * reference range and trend badge. Cleans up all created rows afterwards.
 *
 * Self-contained: discovers seed data via API (no hardcoded IDs), so it
 * survives database reseeds.
 */
import { test, expect } from '@playwright/test';

test.setTimeout(150000);

const AUTH_STORAGE_KEY = 'auth-storage';

interface StudyInfo {
  id: string;
  studyDate: string;
  studyTime?: string;
  modality?: string;
  status: string;
  series?: { id: string; modality: string }[];
}

interface ImageInfo {
  id: string;
  width: number;
  height: number;
  instanceNumber: number;
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  const token = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.state?.token ?? null;
    } catch {
      return null;
    }
  }, AUTH_STORAGE_KEY);
  expect(token).toBeTruthy();
  return { Authorization: `Bearer ${token}` };
}

test.describe('Follow-up workbench loop', () => {
  test('compare → save record → timeline → trend chart', async ({ page }) => {
    const authHeaders = await login(page);
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

    let patientId: string | null = null;
    let baselineStudyId: string | null = null;
    let comparisonStudyId: string | null = null;
    const imageIds: string[] = [];
    let followUpRecordId: string | null = null;

    try {
      // ── Discover a patient with ≥2 same-modality studies ─────────────────
      const patientsRes = await page.request.get('/api/patients?pageSize=50', { headers: authHeaders });
      const patients = (await patientsRes.json()).data?.items ?? [];
      expect(patients.length).toBeGreaterThan(0);

      let pair: { baseline: StudyInfo; comparison: StudyInfo } | null = null;
      for (const p of patients) {
        const studiesRes = await page.request.get(`/api/patients/${p.id}/studies`, { headers: authHeaders });
        const studies: StudyInfo[] = (await studiesRes.json()).data ?? [];
        if (studies.length < 2) continue;
        const sorted = [...studies].sort((a, b) =>
          `${a.studyDate}${a.studyTime ?? ''}`.localeCompare(`${b.studyDate}${b.studyTime ?? ''}`)
        );
        const byModality = new Map<string, StudyInfo[]>();
        for (const s of sorted) {
          const m = s.modality ?? 'N/A';
          if (!byModality.has(m)) byModality.set(m, []);
          byModality.get(m)!.push(s);
        }
        for (const [, group] of byModality) {
          if (group.length >= 2) {
            pair = { baseline: group[0], comparison: group[group.length - 1] };
            break;
          }
        }
        if (pair) { patientId = p.id; break; }
      }
      expect(pair, 'seed should contain a patient with ≥2 same-modality studies').not.toBeNull();
      baselineStudyId = pair!.baseline.id;
      comparisonStudyId = pair!.comparison.id;

      // ── Sync an RNFL measurement onto both studies' first images ─────────
      const imageIdFor = async (studyId: string): Promise<string | null> => {
        const seriesRes = await page.request.get(`/api/studies/${studyId}/series`, { headers: authHeaders });
        const seriesList = (await seriesRes.json()).data ?? [];
        if (seriesList.length === 0) return null;
        const imgsRes = await page.request.get(`/api/images/search?seriesId=${seriesList[0].id}`, { headers: authHeaders });
        const imgs: ImageInfo[] = (await imgsRes.json()).data?.items ?? [];
        return imgs.length > 0 ? imgs[0].id : null;
      };

      const baseImageId = await imageIdFor(baselineStudyId);
      const compImageId = await imageIdFor(comparisonStudyId);
      expect(baseImageId).toBeTruthy();
      expect(compImageId).toBeTruthy();

      const makeAnn = (imageId: string, value: number) => ({
        id: `e2e-${imageId}-${value}`,
        toolName: 'Length',
        data: {
          handles: { points: [[10, 20, 0], [30, 40, 0]] },
          cachedStats: { [`e2e:${imageId}`]: { length: value, unit: 'mm', statsArray: [] } },
          label: 'RNFL 厚度',
        },
        style: { color: '#ffff00', lineWidth: 2 },
      });
      for (const [imageId, value] of [[baseImageId, 92], [compImageId, 85]] as const) {
        const res = await page.request.post('/api/annotations/sync', {
          headers: jsonHeaders,
          data: { imageId, annotations: [makeAnn(imageId, value)] },
        });
        expect(res.status()).toBe(200);
        imageIds.push(imageId);
      }

      // ── Open the comparison workbench ─────────────────────────────────────
      await page.goto(`/compare?patientId=${patientId}&baseline=${baselineStudyId}&comparison=${comparisonStudyId}`);
      await expect(page.getByText('随访对比工作台')).toBeVisible({ timeout: 20000 });

      // Study selectors reflect the pair
      await expect(page.locator('select').first()).toHaveValue(baselineStudyId);
      await expect(page.locator('select').nth(1)).toHaveValue(comparisonStudyId);

      // Comparison canvas renders (fallback image loads)
      await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20000 });

      // Mode toggle buttons present
      await expect(page.getByRole('button', { name: /并排对比/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /叠加对比/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /滑动对比/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /同步/ })).toBeVisible();

      // Switch to overlay → difference blend is the default (i18n label)
      await page.getByRole('button', { name: /叠加对比/ }).click();
      await expect(page.getByRole('button', { name: 'Difference' })).toHaveClass(/bg-primary/);

      // Measurement toggle
      await page.getByRole('button', { name: /测量/ }).click();
      await expect(page.getByRole('button', { name: /测量中/ })).toBeVisible();

      // ── Save the follow-up record ─────────────────────────────────────────
      await page.getByRole('button', { name: /保存随访记录/ }).click();
      await expect(page.getByText(/随访记录已保存|随访记录已更新/).first()).toBeVisible({ timeout: 15000 });

      // Delta table shows the RNFL row with trend
      await expect(page.getByText('RNFL 厚度').first()).toBeVisible({ timeout: 10000 });

      // ── Patient detail: timeline lists the record ─────────────────────────
      await page.goto(`/patients/${patientId}`);
      await page.getByRole('tab', { name: '时间轴' }).click();
      await expect(page.getByText('→').first()).toBeVisible({ timeout: 10000 });
      const recordRow = page.getByText(/打开工作台/).first();
      await expect(recordRow).toBeVisible();

      // Capture the record id from the timeline (via API)
      const recordsRes = await page.request.get(`/api/follow-up?patientId=${patientId}`, { headers: authHeaders });
      const records = (await recordsRes.json()).data?.items ?? [];
      expect(records.length).toBeGreaterThanOrEqual(1);
      followUpRecordId = records[0].id;

      // Click → back to workbench
      await recordRow.click();
      await page.waitForURL(/\/compare\?/);
      await expect(page.getByText('随访对比工作台')).toBeVisible();

      // ── Trend tab: facet chart with reference range + badge ───────────────
      await page.goto(`/patients/${patientId}`);
      await page.getByRole('tab', { name: '随访趋势' }).click();
      await expect(page.getByText('RNFL 厚度').first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('参考区间: ≥ 80μm').first()).toBeVisible({ timeout: 10000 });
      // Trend badge: 92 → 85 is -7.6% (worsening for RNFL)
      await expect(page.getByText('恶化').first()).toBeVisible({ timeout: 10000 });

      // KPI view
      await page.getByRole('button', { name: 'KPI 卡' }).click();
      await expect(page.getByText('vs 基线').first()).toBeVisible({ timeout: 10000 });
    } finally {
      // ── Cleanup ───────────────────────────────────────────────────────────
      const headers = authHeaders;
      if (followUpRecordId) {
        await page.request.delete(`/api/follow-up/${followUpRecordId}`, { headers });
      }
      for (const imageId of imageIds) {
        await page.request.post('/api/annotations/sync', {
          headers: jsonHeaders,
          data: { imageId, annotations: [] },
        });
      }
    }
  });
});
