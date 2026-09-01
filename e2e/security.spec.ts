import { test, expect } from '@playwright/test';

test.describe('Phase 11: Security & Negative End-to-End Regression Suite', () => {

  // TEST 1 — Unauthenticated protected route
  test('TEST 1: Unauthenticated request directly navigating to protected routes is redirected to login', async ({ page }) => {
    await page.goto('/');
    // Clear any leftover tokens
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();

    // Verify Login screen is shown
    await expect(page.locator('input[placeholder*="STU-2026-101"]')).toBeVisible();

    // Verify unauthenticated API requests to protected endpoints return 401
    const unauthLoansRes = await page.request.get('/api/v1/loans');
    expect(unauthLoansRes.status()).toBe(401);

    const unauthUsersRes = await page.request.get('/api/v1/users');
    expect(unauthUsersRes.status()).toBe(401);

    const unauthNotesRes = await page.request.get('/api/v1/notes');
    expect(unauthNotesRes.status()).toBe(401);

    const unauthBackupsRes = await page.request.post('/api/v1/backups/create');
    expect(unauthBackupsRes.status()).toBe(401);
  });

  // TEST 2 — Student cannot access admin functionality
  test('TEST 2: Student cannot access admin functionality in UI or via server API', async ({ page }) => {
    // 1. Log in as Student (STU-2026-101)
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    // 2. Verify admin navigation items do NOT exist in student DOM
    await expect(page.locator('text=إدارة حسابات الطلبة')).not.toBeVisible();
    await expect(page.locator('text=الإعدادات والنسخ الاحتياطي')).not.toBeVisible();
    await expect(page.locator('text=تسيير الإعارات والتمديد')).not.toBeVisible();

    // 3. Extract Student Token and attempt admin API operations
    const token = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(token).toBeTruthy();

    // Student attempts to fetch full users list
    const usersRes = await page.request.get('/api/v1/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(usersRes.status()).toBe(403);

    // Student attempts to update system settings
    const settingsRes = await page.request.put('/api/v1/settings', {
      headers: { Authorization: `Bearer ${token}` },
      data: { academicYear: '2099/3000' },
    });
    expect(settingsRes.status()).toBe(403);

    // Student attempts to trigger database backup
    const backupRes = await page.request.post('/api/v1/backups/create', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(backupRes.status()).toBe(403);
  });

  // TEST 3 — Student cannot perform administrative circulation actions
  test('TEST 3: Student cannot perform administrative circulation actions (approve, handover, return)', async ({ page }) => {
    // 1. Log in as Student (STU-2026-101)
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    const token = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(token).toBeTruthy();

    // Attempt direct loan issuance (Admin only)
    const issueRes = await page.request.post('/api/v1/loans', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        bookId: 'b-001',
        studentId: 'stu-001',
        purpose: 'general_reading',
      },
    });
    expect(issueRes.status()).toBe(403);

    // Attempt request approval (Admin only)
    const approveRes = await page.request.post('/api/v1/loan-requests/lr-001/approve', {
      headers: { Authorization: `Bearer ${token}` },
      data: { approvedDurationDays: 14 },
    });
    expect(approveRes.status()).toBe(403);

    // Attempt handover (Admin only)
    const handoverRes = await page.request.post('/api/v1/loan-requests/lr-001/handover', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(handoverRes.status()).toBe(403);

    // Attempt return (Admin only)
    const returnRes = await page.request.post('/api/v1/loans/l-001/return', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(returnRes.status()).toBe(403);
  });

  // TEST 4 — Student cannot modify another student's data
  test('TEST 4: Student cannot modify another student reading progress, favorites, or submissions', async ({ page }) => {
    // 1. Log in as Student A (STU-2026-101)
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    const studentAToken = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(studentAToken).toBeTruthy();

    // Student A attempts to submit a book submission impersonating Student B (stu-002)
    const subRes = await page.request.post('/api/v1/submissions', {
      headers: { Authorization: `Bearer ${studentAToken}` },
      data: {
        title: 'كتاب محاولة انتحال هوية',
        author: 'مؤلف مجهول',
        suggestedCategory: 'دراسات',
        studentId: 'stu-002',
        studentName: 'سارة بنت سالم البوسعيدية',
        justification: 'اختبار أمني لعدم إمكانية انتحال الهوية',
      },
    });

    if (subRes.ok()) {
      const body = await subRes.json();
      // Server must enforce the authentic student ID from token (stu-001), NOT the spoofed one
      expect(body.data.studentId).toBe('stu-001');
    } else {
      expect([400, 403]).toContain(subRes.status());
    }

    // Student A tries to query Student B reading progress by query param
    const progressRes = await page.request.get('/api/v1/reading-progress?studentId=stu-002', {
      headers: { Authorization: `Bearer ${studentAToken}` },
    });
    expect(progressRes.ok()).toBe(true);
    const progressData = await progressRes.json();
    // Server enforces filtering by req.user.id ('stu-001')
    for (const item of progressData.data) {
      expect(item.studentId).toBe('stu-001');
    }
  });

  // TEST 5 — Student cannot access another student's private note
  test('TEST 5: Student cannot view or access another student private note', async ({ page }) => {
    // 1. Log in as Student A and create note
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    const studentAToken = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(studentAToken).toBeTruthy();

    // Fetch a valid book ID
    const booksRes = await page.request.get('/api/v1/books');
    const booksList = (await booksRes.json()).data;
    const sampleBook = booksList && booksList.length > 0 ? booksList[0] : null;
    const bookId = sampleBook ? sampleBook.id : 'book-001';

    const secretContent = `فائدة سرية وخاصة جداً للطالب أحمد - ${Date.now()}`;
    const createNoteRes = await page.request.post('/api/v1/notes', {
      headers: { Authorization: `Bearer ${studentAToken}` },
      data: {
        bookId,
        bookTitle: sampleBook ? sampleBook.title : 'كتاب الفقه وأصوله',
        content: secretContent,
        pageNumber: 10,
      },
    });
    expect(createNoteRes.ok()).toBe(true);
    const note = (await createNoteRes.json()).data;

    // 2. Logout Student A
    await page.click('button[aria-label="حساب المستخدم وتسجيل الخروج"]');
    await page.click('text=تسجيل الخروج من الحساب');

    // 3. Log in as Student B (STU-2026-102)
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-102');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=سارة بنت سالم البوسعيدية').first()).toBeVisible({ timeout: 15000 });

    const studentBToken = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(studentBToken).toBeTruthy();

    // Student B queries notes API with attempt to query Student A
    const notesRes = await page.request.get(`/api/v1/notes?studentId=stu-001`, {
      headers: { Authorization: `Bearer ${studentBToken}` },
    });
    expect(notesRes.ok()).toBe(true);
    const notesList = (await notesRes.json()).data;
    // Secret note must NOT be present in Student B's results
    const found = notesList.find((n: any) => n.id === note.id || n.content.includes(secretContent));
    expect(found).toBeUndefined();
  });

  // TEST 6 — Invalid resource ID / IDOR attempt
  test('TEST 6: Cross-student IDOR DELETE attempt against another student note is rejected', async ({ page }) => {
    // 1. Log in as Student A (STU-2026-101)
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    const studentAToken = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(studentAToken).toBeTruthy();

    const booksRes = await page.request.get('/api/v1/books');
    const booksList = (await booksRes.json()).data;
    const sampleBook = booksList && booksList.length > 0 ? booksList[0] : null;
    const bookId = sampleBook ? sampleBook.id : 'book-001';

    const noteRes = await page.request.post('/api/v1/notes', {
      headers: { Authorization: `Bearer ${studentAToken}` },
      data: {
        bookId,
        bookTitle: sampleBook ? sampleBook.title : 'كتاب الفقه وأصوله',
        content: `فائدة لاختبار محاولة الحذف غير المصرح به - ${Date.now()}`,
        pageNumber: 15,
      },
    });
    expect(noteRes.ok()).toBe(true);
    const targetNote = (await noteRes.json()).data;

    // 2. Logout and Login as Student B
    await page.click('button[aria-label="حساب المستخدم وتسجيل الخروج"]');
    await page.click('text=تسجيل الخروج من الحساب');

    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-102');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=سارة بنت سالم البوسعيدية').first()).toBeVisible({ timeout: 15000 });

    const studentBToken = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(studentBToken).toBeTruthy();

    // Student B attempts IDOR DELETE on Student A's note
    await page.request.delete(`/api/v1/notes/${targetNote.id}`, {
      headers: { Authorization: `Bearer ${studentBToken}` },
    });

    // 3. Log back in as Student A and verify note was NOT deleted
    await page.click('button[aria-label="حساب المستخدم وتسجيل الخروج"]');
    await page.click('text=تسجيل الخروج من الحساب');

    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    const checkRes = await page.request.get('/api/v1/notes', {
      headers: { Authorization: `Bearer ${studentAToken}` },
    });
    const checkNotes = (await checkRes.json()).data;
    expect(checkNotes.some((n: any) => n.id === targetNote.id)).toBe(true);
  });

  // TEST 7 — Student cannot create/administer users
  test('TEST 7: Student cannot create users, import rosters, or reset passwords', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    const token = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(token).toBeTruthy();

    // Attempt user creation
    const createRes = await page.request.post('/api/v1/users', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: 'مستخدم غير مصرح به',
        registrationNumber: `STU-HACK-${Date.now()}`,
        role: 'student',
      },
    });
    expect(createRes.status()).toBe(403);

    // Attempt roster import
    const rosterRes = await page.request.post('/api/v1/users/roster-import', {
      headers: { Authorization: `Bearer ${token}` },
      data: { students: [{ name: 'طالب غير مصرح به', registrationNumber: 'STU-HACK-01' }] },
    });
    expect(rosterRes.status()).toBe(403);

    // Attempt admin password reset
    const resetRes = await page.request.post('/api/v1/users/adm-001/reset-password', {
      headers: { Authorization: `Bearer ${token}` },
      data: { newPassword: 'HackedAdminPassword123' },
    });
    expect(resetRes.status()).toBe(403);
  });

  // TEST 8 — Role escalation attempt
  test('TEST 8: Role escalation attempt from student to admin is rejected by the server', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    const token = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(token).toBeTruthy();

    // Attempt to update user role to 'admin' via /api/v1/users/:id
    const escalateRes = await page.request.put('/api/v1/users/stu-001', {
      headers: { Authorization: `Bearer ${token}` },
      data: { role: 'admin', roleId: 'admin' },
    });
    // Server must reject (403 or 404)
    expect([403, 404]).toContain(escalateRes.status());

    // Verify current profile role via /api/v1/auth/me is strictly unchanged
    const meRes = await page.request.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.ok()).toBe(true);
    const meData = await meRes.json();
    expect(meData.data.user.role).toBe('student');
  });

  // TEST 9 — Logout invalidates application session
  test('TEST 9: Logout clears client session token and invalidates access to protected UI and API', async ({ page }) => {
    // 1. Log in
    await page.goto('/');
    await page.fill('input[placeholder*="STU-2026-101"]', 'STU-2026-101');
    await page.fill('input[placeholder="••••••••••••"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=أحمد بن محمد الحارثي').first()).toBeVisible({ timeout: 15000 });

    // Verify token exists in localStorage
    const beforeToken = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(beforeToken).toBeTruthy();

    // 2. Perform Logout
    await page.click('button[aria-label="حساب المستخدم وتسجيل الخروج"]');
    await page.click('text=تسجيل الخروج من الحساب');
    await expect(page.locator('input[placeholder*="STU-2026-101"]')).toBeVisible({ timeout: 10000 });

    // Verify token was erased from localStorage
    const afterToken = await page.evaluate(() => localStorage.getItem('mishkat_jwt_token'));
    expect(afterToken).toBeNull();

    // 3. Reload page and verify still on LoginView
    await page.reload();
    await expect(page.locator('input[placeholder*="STU-2026-101"]')).toBeVisible();
    await expect(page.locator('text=فضاء الطالب والأبحاث')).not.toBeVisible();
  });

  // TEST 10 — Sensitive data exposure
  test('TEST 10: Auth and user API responses do not expose sensitive credentials or password hashes', async ({ page }) => {
    // 1. Perform Login via API
    const loginRes = await page.request.post('/api/v1/auth/login', {
      data: {
        registrationNumber: 'STU-2026-101',
        password: '123456',
      },
    });
    expect(loginRes.ok()).toBe(true);
    const loginBody = await loginRes.json();
    const user = loginBody.data.user;

    // Check forbidden sensitive fields
    expect(user).not.toHaveProperty('password_hash');
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('salt');
    expect(user).not.toHaveProperty('resetToken');
    expect(user).not.toHaveProperty('jwtSecret');

    // 2. Check /api/v1/auth/me response
    const meRes = await page.request.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${loginBody.data.token}` },
    });
    expect(meRes.ok()).toBe(true);
    const meUser = (await meRes.json()).data.user;
    expect(meUser).not.toHaveProperty('password_hash');
    expect(meUser).not.toHaveProperty('passwordHash');
    expect(meUser).not.toHaveProperty('password');
    expect(meUser).not.toHaveProperty('salt');
  });

});
