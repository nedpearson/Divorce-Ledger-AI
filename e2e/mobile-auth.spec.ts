import { test, expect } from '@playwright/test';

// E2E: Supabase Auth login and mobile dashboard
test.describe('Mobile Auth', () => {
  test('should login and show dashboard', async ({ page }) => {
    // Go to login page
    await page.goto('/auth/login');
    await page.fill('input#email', process.env.TEST_USER_EMAIL || 'testuser@example.com');
    await page.fill('input#password', process.env.TEST_USER_PASSWORD || 'testpassword');
    await page.click('button[type="submit"]');

    // Wait for redirect or dashboard
    await page.waitForURL(/\/mobile|\/dashboard/);

    // Go to mobile page if not redirected
    await page.goto('/mobile');

    // Assert dashboard elements
    await expect(page.locator('text=Divorce Ledger')).toBeVisible();
    await expect(page.locator('text=Documents')).toBeVisible();
    await expect(page.locator('text=Violations')).toBeVisible();
  });
});
