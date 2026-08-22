/**
 * S1 — Login gate (#141): successful admin login + wrong password rejected.
 */
import { test, expect } from '@playwright/test';
import { ADMIN_USER, ADMIN_PASSWORD } from './helpers';

test.setTimeout(60_000);

test.describe('S1 authentication', () => {
  test('wrong password is rejected', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', ADMIN_USER);
    await page.fill('#password', 'definitely-wrong-pass');

    // The login API must respond 401 (UnauthorizedError path).
    const loginResponse = page.waitForResponse(
      (res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await page.click('button[type="submit"]');
    const res = await loginResponse;
    expect(res.status(), 'login with wrong password must be rejected').toBe(401);

    // Still on the login page — no session established.
    await expect(page).toHaveURL(/\/login/);
    const token = await page.evaluate(() => {
      const raw = localStorage.getItem('auth-storage');
      try {
        return JSON.parse(raw ?? '')?.state?.token ?? null;
      } catch {
        return null;
      }
    });
    expect(token, 'no auth token may exist after a failed login').toBeFalsy();
  });

  test('admin can log in with seeded credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', ADMIN_USER);
    await page.fill('#password', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 20_000 });
    const token = await page.evaluate(() => {
      const raw = localStorage.getItem('auth-storage');
      try {
        return JSON.parse(raw ?? '')?.state?.token ?? null;
      } catch {
        return null;
      }
    });
    expect(token, 'auth token should exist after login').toBeTruthy();
  });
});
