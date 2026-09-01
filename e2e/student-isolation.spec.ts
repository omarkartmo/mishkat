import { test, expect } from '@playwright/test';

test.describe('2. Student Data Isolation & Privacy Flow', () => {
  const uniqueNoteContent = `فائدة خاصة بالطالب أحمد حول أحكام البيوع - ${Date.now()}`;

  test('Student A creates a private note, Student B cannot see it', async ({ page }) => {
    // 1. Log in as Student A (STU-2026-101)
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    // 2. Navigate to Study Hub (مفكرة التلخيص والفوائد)
    await page.click('text=مفكرة التلخيص والفوائد');
    await expect(page.locator('text=مفكرة التلخيص وتدوين الفوائد المعرفية')).toBeVisible();

    // 3. Open Quick Note Modal (تدوين فائدة سريعة)
    await page.click('text=تدوين فائدة سريعة');
    await expect(page.locator('text=تدوين فائدة أو إشكال علمي')).toBeVisible();

    // 4. Select existing catalog book from dropdown helper
    await page.locator('select').first().selectOption({ index: 1 });
    await page.fill('input[placeholder="رقم الصفحة"]', '35');
    await page.fill('textarea[placeholder*="اكتب ما استنبطته"]', uniqueNoteContent);

    // 5. Submit note
    await page.click('button:has-text("حفظ الفائدة")');

    // 6. Switch to Notes section (دفتر الفوائد والشواهد)
    await page.click('button:has-text("دفتر الفوائد والشواهد")');
    await expect(page.locator(`text=${uniqueNoteContent}`)).toBeVisible({ timeout: 10000 });

    // 7. Logout Student A
    await page.click('button[aria-label="حساب المستخدم وتسجيل الخروج"]');
    await page.click('text=تسجيل الخروج من الحساب');
    await expect(page.locator('input[placeholder*="STU-2026-101"]')).toBeVisible({ timeout: 10000 });

    // 8. Log in as Student B (STU-2026-102)
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-102');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=سارة بنت سالم البوسعيدية').first()).toBeVisible({ timeout: 15000 });

    // 9. Navigate to Study Hub
    await page.click('text=مفكرة التلخيص والفوائد');
    await page.click('button:has-text("دفتر الفوائد والشواهد")');

    // 10. Verify Student A's unique note is strictly NOT present in Student B's workspace
    await expect(page.locator(`text=${uniqueNoteContent}`)).not.toBeVisible();
  });
});
