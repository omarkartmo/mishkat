import { test, expect } from '@playwright/test';

test.describe('4. Student User Management & Password Reset Flow', () => {
  const uniqueReg = `STU-E2E-${Date.now().toString().slice(-5)}`;
  const studentFullName = 'طالب الاختبار الميداني الآلي';
  const newPassword = 'NewSecretPass123';

  test('Admin creates student account, resets password, and student logs in successfully', async ({ page }) => {
    // 1. Log in as Admin (ADM-001)
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'ADM-001');
    await page.fill('input[placeholder="••••••••••••"]', 'admin123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=أمين المكتبة').first()).toBeVisible({ timeout: 15000 });

    // 2. Navigate to Student Manager (إدارة حسابات الطلبة)
    await page.click('text=إدارة حسابات الطلبة');
    await expect(page.locator('text=إدارة حسابات الطلبة وبيانات الدخول المركزية')).toBeVisible({ timeout: 10000 });

    // 3. Open Add Student Modal
    await page.click('button:has-text("إضافة طالب يدوياً")');
    await expect(page.locator('text=إضافة حساب طالب جديد')).toBeVisible();

    // 4. Fill Student Form
    await page.fill('input[placeholder*="يحيى بن إبراهيم"]', studentFullName);
    const regInput = page.locator('form input.font-mono').first();
    await regInput.fill(uniqueReg);

    // 5. Submit Add Student Form
    await page.click('button:has-text("حفظ الحساب في الخادم المركزي")');

    // 6. Verify student appears in the list
    await expect(page.locator(`text=${uniqueReg}`)).toBeVisible({ timeout: 10000 });

    // 7. Find student card/row and click Reset Password (Key icon)
    const studentContainer = page.locator(`div:has-text("${uniqueReg}")`).first();
    const resetKeyBtn = studentContainer.locator('button[title*="إعادة تعيين"]').first();
    await resetKeyBtn.click();

    // 8. Enter new password in Reset Modal
    await expect(page.locator('text=إعادة تعيين كلمة المرور')).toBeVisible();
    await page.fill('input[placeholder*="123456"]', newPassword);
    await page.click('button:has-text("تأكيد التحديث")');

    // Wait for success confirmation
    await page.waitForTimeout(2500);

    // 9. Logout Admin
    await page.click('button[aria-label="حساب المستخدم وتسجيل الخروج"]');
    await page.click('text=تسجيل الخروج من الحساب');
    await expect(page.locator('input[placeholder*="STU-2026-101"]')).toBeVisible({ timeout: 10000 });

    // 10. Log in with the newly created student account and reset password
    await page.fill('input[placeholder*="STU-2026-101"]', uniqueReg);
    await page.fill('input[placeholder="••••••••••••"]', newPassword);
    await page.click('button[type="submit"]');

    // 11. Verify successful login and access to student dashboard
    await expect(page.locator(`text=${studentFullName}`).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=فضاء الطالب والأبحاث').first()).toBeVisible();
  });
});
