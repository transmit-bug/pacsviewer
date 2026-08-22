/**
 * Shared E2E helpers — deterministic seeded credentials (#141 harness).
 *
 * The fresh-DB harness (global-setup) seeds the temp DB with
 * INITIAL_ADMIN_PASSWORD (default admin123). The dev-path seed honours this
 * env var and does NOT force a password change, so every spec logs in with
 * these credentials.
 */
export const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
export const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';

const AUTH_STORAGE_KEY = 'auth-storage';

import { expect } from '@playwright/test';

/** UI login as admin; returns Bearer auth headers extracted from localStorage. */
export async function login(page: import('@playwright/test').Page): Promise<Record<string, string>> {
  await page.goto('/login');
  await page.fill('#username', ADMIN_USER);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/', { timeout: 20_000 });
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
  return { Authorization: `Bearer ${token}` };
}

/** Unique suffix helper for synthetic data. */
export function uniq(prefix = ''): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 100000)}`;
}
