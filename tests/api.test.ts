import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createExpressApp } from '../server/index';

let app: Express;
let adminToken: string;
let studentToken: string;
let studentBToken: string;
let studentId: string;
let studentBId: string;
let testBookId: string;

beforeAll(async () => {
  app = await createExpressApp();

  // 1. Authenticate Admin
  const adminLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });

  expect(adminLoginRes.status).toBe(200);
  expect(adminLoginRes.body.success).toBe(true);
  adminToken = adminLoginRes.body.data.token;

  // 2. Authenticate Student A (STU-2026-101)
  const studentLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });

  expect(studentLoginRes.status).toBe(200);
  expect(studentLoginRes.body.success).toBe(true);
  studentToken = studentLoginRes.body.data.token;
  studentId = studentLoginRes.body.data.user.id;

  // 3. Authenticate Student B (STU-2026-102)
  const studentBLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-102', password: '123456' });

  expect(studentBLoginRes.status).toBe(200);
  expect(studentBLoginRes.body.success).toBe(true);
  studentBToken = studentBLoginRes.body.data.token;
  studentBId = studentBLoginRes.body.data.user.id;

  // 4. Create an authoritative physical book for tests
  const createBookRes = await request(app)
    .post('/api/v1/books')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      type: 'physical',
      title: 'كتاب الفقه وأصوله النموذجي',
      author: 'العلامة أبو سعيد',
      categoryId: 'cat-islamic',
      totalCopies: 5,
      availableCopies: 5,
      language: 'العربية',
    });

  if (createBookRes.status !== 201) {
    console.error('CREATE BOOK ERROR:', JSON.stringify(createBookRes.body));
  }
  expect(createBookRes.status).toBe(201);
  testBookId = createBookRes.body.data.id;
  expect(testBookId).toBeDefined();
});

describe('1. Authentication Security & Gateway', () => {
  it('should authenticate admin with valid credentials and return JWT token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ registrationNumber: 'ADM-001', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTypeOf('string');
    expect(res.body.data.user.role).toBe('admin');
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('should authenticate student with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ registrationNumber: 'STU-2026-101', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('student');
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('should reject invalid password with 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ registrationNumber: 'ADM-001', password: 'WrongPassword999' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should reject unauthenticated request to protected endpoint with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return current authenticated user data via GET /api/v1/auth/me', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(studentId);
    expect(res.body.data.user.role).toBe('student');
    expect(res.body.data.user.password_hash).toBeUndefined();
  });
});

describe('2. Role-Based Access Control (RBAC)', () => {
  it('should prevent student from accessing admin user management endpoint (POST /users)', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ registrationNumber: 'HACK-001', name: 'Unauthorized User' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should prevent student from updating system settings (PUT /settings)', async () => {
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ maxLoanDays: 999 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should allow admin to update system settings', async () => {
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maxLoanDays: 14, allowDigitalDownloads: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('3. Student Isolation & IDOR Protection', () => {
  let studentANoteId: string;

  it('should create a private student note for Student A with valid book reference', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        bookId: testBookId,
        bookTitle: 'كتاب الفقه وأصوله',
        pageNumber: 15,
        content: 'فائدة خاصة بالطالب أ حول أحكام الطهارة',
        category: 'فائدة فقهية',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    studentANoteId = res.body.data.id;
    expect(studentANoteId).toBeDefined();
  });

  it('should isolate Student A note so Student B cannot see it in GET /notes', async () => {
    const res = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', `Bearer ${studentBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const noteIds = res.body.data.map((n: any) => n.id);
    expect(noteIds).not.toContain(studentANoteId);
  });

  it('should prevent Student B from modifying or deleting Student A note', async () => {
    await request(app)
      .delete(`/api/v1/notes/${studentANoteId}`)
      .set('Authorization', `Bearer ${studentBToken}`);

    // Verify Student A note is still intact
    const checkRes = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', `Bearer ${studentToken}`);

    const studentANotes = checkRes.body.data.map((n: any) => n.id);
    expect(studentANotes).toContain(studentANoteId);
  });

  it('should isolate bookmarks per student in GET /bookmarks', async () => {
    const createRes = await request(app)
      .post('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        bookId: testBookId,
        bookTitle: 'كتاب الفقه وأصوله',
        currentPage: 42,
        totalPages: 200,
        quickNote: 'موضع التوقف الخاص بالطالب أ',
      });

    expect(createRes.status).toBe(201);
    const bookmarkId = createRes.body.data.id;

    const studentBBookmarks = await request(app)
      .get('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${studentBToken}`);

    const ids = studentBBookmarks.body.data.map((b: any) => b.id);
    expect(ids).not.toContain(bookmarkId);
  });

  it('should isolate reading progress per student in GET /reading-progress', async () => {
    const saveProgressRes = await request(app)
      .post('/api/v1/reading-progress')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        bookId: testBookId,
        currentPage: 25,
        totalPages: 100,
        percentage: 25,
      });

    expect(saveProgressRes.status).toBe(200);

    const studentBProgress = await request(app)
      .get('/api/v1/reading-progress')
      .set('Authorization', `Bearer ${studentBToken}`);

    const studentBBookIds = studentBProgress.body.data.map((p: any) => p.bookId);
    expect(studentBBookIds).not.toContain(testBookId);
  });

  it('should isolate favorites per student in GET /favorites', async () => {
    const favRes = await request(app)
      .post('/api/v1/favorites/toggle')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ bookId: testBookId });

    expect(favRes.status).toBe(200);

    const studentBFavs = await request(app)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${studentBToken}`);

    expect(studentBFavs.body.data).not.toContain(testBookId);
  });
});

describe('4. Circulation & Loan Stock Management', () => {
  let testLoanId: string;
  const initialStock = 5;

  it('should issue a loan and decrement available copies in transaction', async () => {
    const res = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bookId: testBookId,
        studentId: studentId,
        purpose: 'academic_research',
        customDurationDays: 7,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    testLoanId = res.body.data.id;

    // Verify stock decremented
    const bookRes = await request(app).get('/api/v1/books');
    const book = bookRes.body.data.find((b: any) => b.id === testBookId);
    expect(book.availableCopies).toBe(initialStock - 1);
  });

  it('should return loan and increment available copies back to catalog', async () => {
    const res = await request(app)
      .put(`/api/v1/loans/${testLoanId}/return`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'تم الإرجاع بحالة ممتازة' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify stock restored
    const bookRes = await request(app).get('/api/v1/books');
    const book = bookRes.body.data.find((b: any) => b.id === testBookId);
    expect(book.availableCopies).toBe(initialStock);
  });

  it('should reject return of non-existent loan with error', async () => {
    const res = await request(app)
      .put('/api/v1/loans/non-existent-loan-id/return')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('5. Loan Request Full Lifecycle Workflow', () => {
  let requestId: string;

  it('should allow student to submit physical loan request', async () => {
    const res = await request(app)
      .post('/api/v1/loan-requests')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        bookId: testBookId,
        purpose: 'مشروع تخرج',
        requestedDurationDays: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
    requestId = res.body.data.id;
  });

  it('should allow admin to approve loan request', async () => {
    const res = await request(app)
      .post(`/api/v1/loan-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approvedDurationDays: 10, adminNotes: 'تمت الموافقة' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should allow admin to complete handover and generate active loan record', async () => {
    const res = await request(app)
      .post(`/api/v1/loan-requests/${requestId}/handover`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.loanId).toBeDefined();

    // Verify loan request status updated
    const listRes = await request(app)
      .get('/api/v1/loan-requests')
      .set('Authorization', `Bearer ${adminToken}`);

    const req = listRes.body.data.find((r: any) => r.id === requestId);
    expect(req.status).toBe('handed_over');
  });
});

describe('6. Book Submissions & Digital Ingestion Workflow', () => {
  let submissionId: string;

  it('should allow student to submit digital book recommendation', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'كتاب مناهج البحث العلمي الحديث',
        author: 'د. عبد الله المحمود',
        sourcePortalName: 'المكتبة الشاملة',
        suggestedCategoryId: 'cat-education',
        summary: 'دراسة منهجية في أصول البحث العلمي والأكاديمي',
        format: 'pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
    submissionId = res.body.data.id;
  });

  it('should allow admin to review and approve submission, adding it to master catalog', async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'approved',
        adminFeedback: 'تم اعتماد الكتاب وإضافته إلى المستودع الرقمي بالمكتبة',
        categoryId: 'cat-education',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify digital book exists in catalog
    const booksRes = await request(app).get('/api/v1/books?type=digital');
    const addedBook = booksRes.body.data.find((b: any) => b.title === 'كتاب مناهج البحث العلمي الحديث');
    expect(addedBook).toBeDefined();
    expect(addedBook.author).toBe('د. عبد الله المحمود');
  });
});

describe('7. User Account Management & Password Security', () => {
  let createdUserId: string;
  const testReg = `STU-TEST-${Date.now()}`;

  it('should allow admin to create student user without exposing password_hash', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: testReg,
        name: 'طالب اختبار الجودة والأمان',
        grade: 'الصف الحادي عشر',
        email: 'qa.student@mishkat.edu',
        role: 'student',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    createdUserId = res.body.data.id;
    expect(res.body.data.password_hash).toBeUndefined();
  });

  it('should allow admin to reset student password securely and allow login with new pass', async () => {
    const res = await request(app)
      .post(`/api/v1/users/${createdUserId}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'NewSecurePass123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.newPassword).toBe('NewSecurePass123');

    // Test login with newly assigned password
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ registrationNumber: testReg, password: 'NewSecurePass123' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.token).toBeDefined();
  });

  it('should NEVER return password_hash in GET /api/v1/users list', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const u of res.body.data) {
      expect(u.password_hash).toBeUndefined();
      expect(u.password).toBeUndefined();
    }
  });
});

describe('8. System Security, Backups & Reset Endpoints', () => {
  it('should block non-admin from creating backups', async () => {
    const res = await request(app)
      .post('/api/v1/backups/create')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should allow admin to create authoritative database backup', async () => {
    const res = await request(app)
      .post('/api/v1/backups/create')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fileName).toMatch(/^mishkat_backup_/);
    expect(res.body.data.tablesCount).toBeGreaterThan(10);
    expect(res.body.data.backup).toBeDefined();
  });

  it('should reject system reset request without explicit confirm flag', async () => {
    const res = await request(app)
      .post('/api/v1/system/reset-demo')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFIRMATION_REQUIRED');
  });

  it('should block non-admin from triggering system reset even with confirm flag', async () => {
    const res = await request(app)
      .post('/api/v1/system/reset-demo')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ confirm: true });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
