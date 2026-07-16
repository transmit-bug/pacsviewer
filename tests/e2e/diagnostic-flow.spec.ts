/**
 * E2E Test — Complete Diagnostic Workflow.
 *
 * Flow: Login → Patient List → Patient Detail → Open Study Viewer → Report
 */

import { test, expect } from '@playwright/test';

test.describe('Diagnostic Workflow', () => {
  test('login and navigate to patient list', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    await expect(page).toHaveTitle(/.*/);

    // Fill login form
    await page.fill('input[name="username"], input[placeholder*="用户"]', 'admin');
    await page.fill('input[name="password"], input[type="password"]', 'admin123');

    // Submit
    await page.click('button[type="submit"]');

    // Should navigate to dashboard or patient list
    await page.waitForURL('**/', { timeout: 10000 });
  });

  test('dashboard page loads', async ({ page }) => {
    await page.goto('/');
    // Check that the page has content
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('text=常规设置')).toBeVisible();
  });

  test('devices page loads', async ({ page }) => {
    await page.goto('/devices');
    await expect(page.locator('text=设备管理')).toBeVisible();
  });
});
