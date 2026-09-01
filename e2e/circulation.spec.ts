import { test, expect } from '@playwright/test';

test.describe('3. Circulation & Physical Borrowing Lifecycle Flow', () => {
  test('Complete loan request, admin approval, physical handover, and return flow', async ({ page }) => {
    // 1. Log in as Student (STU-2026-101)
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    // 2. Navigate to Comprehensive Search (البحث الشامل) to view physical catalog
    await page.click('text=البحث الشامل');
    await expect(page.locator('text=محرك البحث الشامل')).toBeVisible({ timeout: 10000 });

    // 3. Filter to Physical Books (كتب ورقية)
    await page.click('button:has-text("كتب ورقية")');

    // 4. Submit a borrow request for an available physical book
    const borrowBtn = page.locator('button:has-text("طلب استعارة")').first();
    await expect(borrowBtn).toBeVisible({ timeout: 10000 });
    await borrowBtn.click();

    // 5. Logout Student
    await page.click('button[aria-label="حساب المستخدم وتسجيل الخروج"]');
    await page.click('text=تسجيل الخروج من الحساب');
    await expect(page.locator('input[placeholder*="STU-2026-101"]')).toBeVisible({ timeout: 10000 });

    // 6. Log in as Admin (ADM-001)
    await page.fill('input[placeholder*="STU-2026-101"]', 'ADM-001');
    await page.fill('input[placeholder="••••••••••••"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أمين المكتبة').first()).toBeVisible({ timeout: 15000 });

    // 7. Navigate to Circulation & Loans Manager (تسيير الإعارات والتمديد)
    await page.click('text=تسيير الإعارات والتمديد');
    await expect(page.locator('text=نظام تسيير الإعارات وتتبع الاستحقاق')).toBeVisible();

    // 8. Select Requests view if not active and approve the pending request
    const pendingTabBtn = page.locator('button:has-text("طلبات الإعارة الواردة")');
    if (await pendingTabBtn.isVisible()) {
      await pendingTabBtn.click();
    }

    const approveBtn = page.locator('button:has-text("تحديد المدة والموافقة")').first();
    await expect(approveBtn).toBeVisible({ timeout: 10000 });
    await approveBtn.click();

    // Confirm approval modal
    await page.click('button:has-text("تأكيد الموافقة وإرسال إشعار للطالب")');

    // 9. Complete Handover
    const handoverBtn = page.locator('button:has-text("تأكيد خروج الكتاب وتسليمه للطالب")').first();
    await expect(handoverBtn).toBeVisible({ timeout: 10000 });
    await handoverBtn.click();

    // 10. Switch to Active Loans tab
    await page.click('button:has-text("سجل الإعارات النشطة")');

    // 11. Return the book
    const returnBtn = page.locator('button:has-text("إرجاع")').first();
    await expect(returnBtn).toBeVisible({ timeout: 10000 });
    await returnBtn.click();

    // Confirm Return in modal
    await page.click('button:has-text("تأكيد الإرجاع الآن")');

    // 12. Verify status badge displays returned or completed
    await expect(page.locator('text=مكتمل').first()).toBeVisible({ timeout: 10000 });
  });
});
