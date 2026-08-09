/**
 * E2E Test — Annotation Save / Restore Loop (ticket #99).
 *
 * Flow: Login → upload a real fixture image → open the study viewer (fixture
 * is the first image) → draw a Length measurement → verify it auto-saves to
 * the backend → reload the page → verify it is restored and rendered.
 *
 * Self-contained: creates its own image row + file via the upload API and
 * cleans up afterwards (annotations + image), so it does not depend on the
 * (broken) seed image files.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.setTimeout(120000);

const STUDY_ID = '0bea8a95-2099-4770-ac57-70d6060f81d0';
const SERIES_ID = '93b1730c-9e61-4586-a030-58f325f678c3';
const FIXTURE_PATH = 'apps/server/data/images/_fundus_dr.png';
const AUTH_STORAGE_KEY = 'auth-storage';

test.describe('Annotation persistence loop', () => {
  test('draw a length measurement → saved → restored after reload', async ({ page }) => {
    // ── Login ────────────────────────────────────────────────────────────────
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
    expect(token, 'auth token should exist after login').toBeTruthy();
    const authHeaders = { Authorization: `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

    let fixtureImageId: string | null = null;

    try {
      // Upload a real fixture image as the first image of the series.
      // Negative instanceNumber sorts before the seed images (instance 1, 2)
      // so the viewer displays it first. (instanceNumber=0 is coerced to 1
      // by `Number(...) || 1` in the upload route.)
      const uploadRes = await page.request.post('/api/images/upload', {
        headers: authHeaders,
        multipart: {
          file: {
            name: 'fixture.png',
            mimeType: 'image/png',
            buffer: readFileSync(FIXTURE_PATH),
          },
          seriesId: SERIES_ID,
          instanceNumber: '-5',
        },
      });
      expect(uploadRes.status(), 'fixture upload should succeed').toBe(201);
      const uploadBody = await uploadRes.json();
      fixtureImageId = uploadBody.data?.id;
      expect(fixtureImageId).toBeTruthy();

      // Clean any leftover annotations for the fixture image
      const cleanRes = await page.request.post('/api/annotations/sync', {
        headers: jsonHeaders,
        data: { imageId: fixtureImageId, annotations: [] },
      });
      expect(cleanRes.status()).toBe(200);

      // ── Open the study viewer (fixture is images[0]) and wait for the image ─
      const imageLoadPromise = page.waitForResponse(
        (res) => res.url().includes(`/api/images/${fixtureImageId}/file`) && res.status() === 200,
        { timeout: 30000 },
      );
      await page.goto(`/viewer/${STUDY_ID}`);
      const viewport = page.locator('div.relative.w-full.h-full.bg-black');
      await expect(viewport.locator('canvas').first()).toBeVisible({ timeout: 20000 });

      // Wait until the fixture image actually loads (wadouri → /file?format=dicom)
      await imageLoadPromise;

      const box = await viewport.locator('canvas').first().boundingBox();
      expect(box).not.toBeNull();

      // ── Select the Length tool (lucide Ruler icon button) ───────────────────
      await page.locator('button svg.lucide-ruler').first().click();

      // ── Draw a length measurement: drag on the viewport ─────────────────────
      const startX = box!.x + box!.width * 0.3;
      const startY = box!.y + box!.height * 0.4;
      const endX = box!.x + box!.width * 0.6;
      const endY = box!.y + box!.height * 0.45;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 8 });
      await page.mouse.up();

      // ── The annotation should render in the viewport SVG layer ──────────────
      await expect(viewport.locator('svg line, svg path')).not.toHaveCount(0, {
        timeout: 5000,
      });

      // ── Verify auto-save: poll the backend until the Length annotation lands ─
      await expect
        .poll(
          async () => {
            const res = await page.request.get(`/api/annotations/image/${fixtureImageId}`, {
              headers: authHeaders,
            });
            if (!res.ok()) return 0;
            const body = await res.json();
            const items = Array.isArray(body?.data) ? body.data : [];
            return items.filter((a: any) => a.toolName === 'Length').length;
          },
          { timeout: 10000, intervals: [500, 500, 500, 1000] },
        )
        .toBeGreaterThan(0);

      // ── Reload → annotations should be restored from the backend ────────────
      const reloadLoadPromise = page.waitForResponse(
        (res) => res.url().includes(`/api/images/${fixtureImageId}/file`) && res.status() === 200,
        { timeout: 30000 },
      );
      await page.reload();
      await expect(viewport.locator('canvas').first()).toBeVisible({ timeout: 20000 });
      await reloadLoadPromise;

      // Restore is async; poll until the length annotation SVG reappears.
      await expect
        .poll(
          async () => viewport.locator('svg line, svg path').count(),
          { timeout: 15000, intervals: [500, 500, 1000] },
        )
        .toBeGreaterThan(0);
    } finally {
      // ── Cleanup: remove annotations and the fixture image ───────────────────
      if (fixtureImageId) {
        await page.request.post('/api/annotations/sync', {
          headers: jsonHeaders,
          data: { imageId: fixtureImageId, annotations: [] },
        });
        await page.request.delete(`/api/images/${fixtureImageId}`, { headers: authHeaders });
      }
    }
  });
});
