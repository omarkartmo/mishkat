import { test, expect } from '@playwright/test';

test.describe('1. Authentication & Session Survival Flow', () => {
  test('Student login succeeds, survives refresh, and logs out cleanly', async ({ page }) => {
    // 1. Navigate to home
    await page.goto('/');

    // Verify Login Screen renders
    await expect(page.locator('input[placeholder*="STU-2026-101"]')).toBeVisible();

    // 2. Perform Student Login
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');

    // 3. Verify user enters student portal
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=فضاء الطالب والأبحاث').first()).toBeVisible();

    // 4. Verify Authenticated state survives page reload (JWT token in localStorage + /api/v1/auth/me)
    await page.reload();
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=فضاء الطالب والأبحاث').first()).toBeVisible();

    // 5. Open User Profile Dropdown and Logout
    await page.click('button[aria-label="حساب المستخدم وتسجيل الخروج"]');
    await page.click('text=تسجيل الخروج من الحساب');

    // 6. Verify returned to LoginView
    await expect(page.locator('input[placeholder*="STU-2026-101"]')).toBeVisible({ timeout: 10000 });
  });
});
