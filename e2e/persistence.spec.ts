import { test, expect } from '@playwright/test';

test.describe('5. Database State Persistence Across Sessions Flow', () => {
  test('Student toggles a favorite, verifies persistence after reload, logout, and re-login', async ({ page }) => {
    // 1. Log in as Student (STU-2026-101)
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    // 2. Navigate to Comprehensive Search to view books
    await page.click('text=البحث الشامل');
    await expect(page.locator('text=محرك البحث الشامل')).toBeVisible({ timeout: 10000 });

    // 3. Find first favorite button and toggle favorite
    const favButton = page.locator('button[title*="المفضلة"]').first();
    await expect(favButton).toBeVisible({ timeout: 10000 });
    await favButton.click();

    // 4. Navigate to Favorites Tab (الكتب المفضلة) and verify book is listed
    await page.click('text=الكتب المفضلة');
    await expect(page.locator('text=قائمة الكتب والمراجع المفضلة')).toBeVisible({ timeout: 10000 });

    // Verify favorite items exist
    const favCards = page.locator('button[title="إزالة من المفضلة"]');
    await expect(favCards.first()).toBeVisible({ timeout: 10000 });

    // 5. Reload Browser and verify favorite persists directly from PostgreSQL API
    await page.reload();
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });
    await page.click('text=الكتب المفضلة');
    await expect(page.locator('button[title="إزالة من المفضلة"]').first()).toBeVisible({ timeout: 10000 });

    // 6. Logout Student
    await page.click('button[aria-label="حساب المستخدم وتسجيل الخروج"]');
    await page.click('text=تسجيل الخروج من الحساب');
    await expect(page.locator('input[placeholder*="STU-2026-101"]')).toBeVisible({ timeout: 10000 });

    // 7. Login again as Student (STU-2026-101)
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    // 8. Verify favorite still exists after full re-authentication
    await page.click('text=الكتب المفضلة');
    await expect(page.locator('button[title="إزالة من المفضلة"]').first()).toBeVisible({ timeout: 10000 });
  });
});
