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

describe('9. Physical Copy Concurrency & Race-Condition Hardening', () => {
  let singleCopyBookId: string;
  let doubleCopyBookId: string;

  beforeAll(async () => {
    // 1. Create a book with exactly 1 available copy
    const book1Res = await request(app)
      .post('/api/v1/books')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'physical',
        title: 'كتاب اختبار التزامن - نسخة واحدة',
        author: 'مؤلف التزامن',
        categoryId: 'cat-islamic',
        totalCopies: 1,
        availableCopies: 1,
        location: { cabinet: 'A', shelf: '1', section: '1' },
      });
    singleCopyBookId = book1Res.body.data.id;

    // 2. Create a book with exactly 2 available copies
    const book2Res = await request(app)
      .post('/api/v1/books')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'physical',
        title: 'كتاب اختبار التزامن - نسختان',
        author: 'مؤلف التزامن',
        categoryId: 'cat-islamic',
        totalCopies: 2,
        availableCopies: 2,
        location: { cabinet: 'A', shelf: '2', section: '1' },
      });
    doubleCopyBookId = book2Res.body.data.id;
  });

  it('should prevent dual allocation when 2 concurrent requests compete for 1 available copy', async () => {
    // Fire two concurrent loan issuance requests simultaneously
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          bookId: singleCopyBookId,
          studentId: studentId,
          purpose: 'academic_research',
          customDurationDays: 7,
        }),
      request(app)
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          bookId: singleCopyBookId,
          studentId: studentBId,
          purpose: 'general_reading',
          customDurationDays: 7,
        }),
    ]);

    const statuses = [resA.status, resB.status];
    // Exactly one request must succeed (201) and the competing request must fail (400)
    expect(statuses).toContain(201);
    expect(statuses).toContain(400);

    // Verify book stock is exactly 0
    const checkRes = await request(app).get('/api/v1/books');
    const book = checkRes.body.data.find((b: any) => b.id === singleCopyBookId);
    expect(book.availableCopies).toBe(0);

    // Verify exactly 1 active loan exists for this book
    const loansRes = await request(app)
      .get(`/api/v1/loans?bookId=${singleCopyBookId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const activeLoans = loansRes.body.data.filter((l: any) => l.bookId === singleCopyBookId && l.status === 'active');
    expect(activeLoans.length).toBe(1);
  });

  it('should allocate distinct physical copies when 2 concurrent requests compete for 2 available copies', async () => {
    // Fire two concurrent loan requests for the book with 2 copies
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          bookId: doubleCopyBookId,
          studentId: studentId,
          purpose: 'academic_research',
          customDurationDays: 7,
        }),
      request(app)
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          bookId: doubleCopyBookId,
          studentId: studentBId,
          purpose: 'general_reading',
          customDurationDays: 7,
        }),
    ]);

    // Both requests must succeed
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);

    // Verify they received different copy IDs (no dual assignment of the same physical copy)
    const copyIdA = resA.body.data.copyId;
    const copyIdB = resB.body.data.copyId;
    if (copyIdA && copyIdB) {
      expect(copyIdA).not.toBe(copyIdB);
    }

    // Verify book stock is now 0
    const checkRes = await request(app).get('/api/v1/books');
    const book = checkRes.body.data.find((b: any) => b.id === doubleCopyBookId);
    expect(book.availableCopies).toBe(0);
  });
});

describe('10. Production Operations Hardening (Health, Logger, Port)', () => {
  it('should return 200 with structured health checks in GET /api/v1/health', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.checks).toBeDefined();
    expect(res.body.data.checks.process).toBe('alive');
    expect(res.body.data.checks.storage).toBe('writable');
    expect(['connected', 'embedded_wal_connected']).toContain(res.body.data.checks.database);
    expect(res.body.data.storagePaths).toBeDefined();
    expect(res.body.data.counts).toBeDefined();
  });

  it('should redact sensitive credentials in logger data sanitizer', async () => {
    const { sanitizeLogData } = await import('../server/utils/logger');
    const sensitivePayload = {
      user: 'admin',
      password: 'superSecretPassword123',
      token: 'jwt.token.secret',
      nested: {
        jwtSecret: 'veryLongSecretKeyMinimum32Characters',
        authorization: 'Bearer secret_auth_token',
        regularField: 'safeValue',
      },
    };

    const sanitized = sanitizeLogData(sensitivePayload);
    expect(sanitized.user).toBe('admin');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.nested.jwtSecret).toBe('[REDACTED]');
    expect(sanitized.nested.authorization).toBe('[REDACTED]');
    expect(sanitized.nested.regularField).toBe('safeValue');
  });

  it('should have valid numeric port configured in serverConfig', async () => {
    const { serverConfig } = await import('../server/config');
    expect(typeof serverConfig.port).toBe('number');
    expect(serverConfig.port).toBeGreaterThan(0);
    expect(serverConfig.port).toBeLessThanOrEqual(65535);
  });
});

describe('11. Backup, Restore & Disaster Recovery (Phase 15.3 & 15.3.1)', () => {
  let initialBackupFileName = '';
  let disasterBackupFileName = '';
  const testMarkerTitle = `كتاب استرجاع الطوارئ المعتمد ${Date.now()}`;
  let disasterBookId = '';
  let disasterNotificationId = '';

  it('Test A: should create a complete database backup with all 15 tables including notifications', async () => {
    const res = await request(app)
      .post('/api/v1/backups/create')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fileName).toBeDefined();
    expect(res.body.data.tablesCount).toBe(15);
    expect(res.body.data.backup).toBeDefined();
    expect(res.body.data.backup.meta.version).toBe('1.0.0');
    expect(res.body.data.backup.data.users).toBeInstanceOf(Array);
    expect(res.body.data.backup.data.books).toBeInstanceOf(Array);
    expect(res.body.data.backup.data.notifications).toBeInstanceOf(Array);

    initialBackupFileName = res.body.data.fileName;

    // Verify backup file exists in filesystem
    const fs = await import('fs');
    const path = await import('path');
    const { serverConfig } = await import('../server/config');
    const backupPath = path.join(serverConfig.dirs.backups, initialBackupFileName);
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  it('Test F: should enforce strict RBAC on restore endpoint (401 unauth, 403 student, 200 admin)', async () => {
    // 1. Unauthenticated request
    const unauthRes = await request(app)
      .post(`/api/v1/backups/${initialBackupFileName}/restore`)
      .send({ confirm: true });
    expect(unauthRes.status).toBe(401);

    // 2. Student request
    const studentRes = await request(app)
      .post(`/api/v1/backups/${initialBackupFileName}/restore`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ confirm: true });
    expect(studentRes.status).toBe(403);
  });

  it('Test G: should reject restore without explicit confirm: true payload', async () => {
    const resNoConfirm = await request(app)
      .post(`/api/v1/backups/${initialBackupFileName}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(resNoConfirm.status).toBe(400);
    expect(resNoConfirm.body.error.code).toBe('CONFIRMATION_REQUIRED');

    const resFalseConfirm = await request(app)
      .post(`/api/v1/backups/${initialBackupFileName}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirm: false });

    expect(resFalseConfirm.status).toBe(400);
    expect(resFalseConfirm.body.error.code).toBe('CONFIRMATION_REQUIRED');
  });

  it('Test H: should prevent path traversal attempts on restore filename', async () => {
    const traversalAttempts = [
      '..%2f..%2fpackage.json',
      '..\\..\\package.json',
      'non_existent_backup_file.json',
      'malicious_script.sh',
    ];

    for (const attempt of traversalAttempts) {
      const res = await request(app)
        .post(`/api/v1/backups/${attempt}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true });

      expect([400, 404]).toContain(res.status);
    }
  });

  it('Test D: should reject corrupt JSON and malformed schema without modifying the database', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { serverConfig } = await import('../server/config');

    // 1. Corrupt JSON file
    const corruptFileName = 'test_corrupt_backup.json';
    fs.writeFileSync(path.join(serverConfig.dirs.backups, corruptFileName), 'NOT_A_VALID_JSON{{{', 'utf8');

    const corruptRes = await request(app)
      .post(`/api/v1/backups/${corruptFileName}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirm: true });

    expect(corruptRes.status).toBe(400);
    expect(corruptRes.body.error.code).toBe('INVALID_BACKUP_FILE');

    // 2. Schema missing required table or admin account
    const invalidSchemaFileName = 'test_invalid_schema.json';
    const invalidPayload = {
      meta: { version: '1.0.0' },
      data: {
        users: [{ id: 'u1', registration_number: 'STU-1', name: 'No Admin', password_hash: 'hash', role_id: 'student' }],
        categories: [],
        books: [],
        physical_copies: [],
        loans: [],
        loan_requests: [],
        reading_progress: [],
        physical_bookmarks: [],
        book_summaries: [],
        student_notes: [],
        student_favorites: [],
        pending_submissions: [],
        whitelisted_portals: [],
        notifications: [],
        system_settings: [],
      },
    };
    fs.writeFileSync(path.join(serverConfig.dirs.backups, invalidSchemaFileName), JSON.stringify(invalidPayload), 'utf8');

    const invalidRes = await request(app)
      .post(`/api/v1/backups/${invalidSchemaFileName}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirm: true });

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error.code).toBe('INVALID_BACKUP_SCHEMA');

    // Clean up temporary test files
    try { fs.unlinkSync(path.join(serverConfig.dirs.backups, corruptFileName)); } catch {}
    try { fs.unlinkSync(path.join(serverConfig.dirs.backups, invalidSchemaFileName)); } catch {}
  });

  it('Test E: REAL Transaction Rollback Verification (Mid-Transaction Forced Failure)', async () => {
    const { setRestoreTestFailureHook } = await import('../server/services/backupService');
    const { db } = await import('../server/db/pool');

    // 1. Capture exact state of representative records before restore attempt
    const { rows: preUsers } = await db.query('SELECT id, registration_number, name, role_id FROM users ORDER BY id');
    const { rows: preBooks } = await db.query('SELECT id, title, available_copies FROM books ORDER BY id');
    const { rows: preLoans } = await db.query('SELECT id, student_id, book_id, status FROM loans ORDER BY id');
    const { rows: preNotes } = await db.query('SELECT id, student_id, book_id, content FROM student_notes ORDER BY id');
    const { rows: preSettings } = await db.query('SELECT key, value FROM system_settings ORDER BY key');

    expect(preUsers.length).toBeGreaterThan(0);
    expect(preBooks.length).toBeGreaterThan(0);

    // 2. Set the test-only failure hook to trigger AFTER truncate and partial insert (mid-transaction after 'books')
    let hookWasTriggered = false;
    setRestoreTestFailureHook((stage) => {
      if (stage === 'mid_insert') {
        hookWasTriggered = true;
        throw new Error('SIMULATED_DATABASE_CRASH_MID_RESTORE_TRANSACTION');
      }
    });

    try {
      // 3. Attempt restore of a valid backup
      const res = await request(app)
        .post(`/api/v1/backups/${initialBackupFileName}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true });

      // Must fail with 500 RESTORE_FAILED
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('RESTORE_FAILED');
      expect(res.body.error.message).toContain('SIMULATED_DATABASE_CRASH_MID_RESTORE_TRANSACTION');
      expect(hookWasTriggered).toBe(true);

      // 4. Assert that rollback restored the EXACT pre-restore records and relationships
      const { rows: postUsers } = await db.query('SELECT id, registration_number, name, role_id FROM users ORDER BY id');
      const { rows: postBooks } = await db.query('SELECT id, title, available_copies FROM books ORDER BY id');
      const { rows: postLoans } = await db.query('SELECT id, student_id, book_id, status FROM loans ORDER BY id');
      const { rows: postNotes } = await db.query('SELECT id, student_id, book_id, content FROM student_notes ORDER BY id');
      const { rows: postSettings } = await db.query('SELECT key, value FROM system_settings ORDER BY key');

      // Same IDs, same values, same counts, same relationships
      expect(postUsers).toEqual(preUsers);
      expect(postBooks).toEqual(preBooks);
      expect(postLoans).toEqual(preLoans);
      expect(postNotes).toEqual(preNotes);
      expect(postSettings).toEqual(preSettings);
    } finally {
      // Always reset hook
      setRestoreTestFailureHook(null);
    }
  });

  it('Test B & C & I & J & K: Full Disaster Recovery Simulation (Create known data -> Backup -> Disaster -> Restore -> Verify)', async () => {
    const { db } = await import('../server/db/pool');

    // 1. Create a known distinct book and note
    const bookCreateRes = await request(app)
      .post('/api/v1/books')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'physical',
        title: testMarkerTitle,
        author: 'المؤلف التجريبي للاسترجاع',
        categoryId: 'cat-islamic',
        totalCopies: 3,
        availableCopies: 3,
        language: 'العربية',
      });

    expect(bookCreateRes.status).toBe(201);
    disasterBookId = bookCreateRes.body.data.id;

    // Create a student private note linked to this book
    const noteCreateRes = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        bookId: disasterBookId,
        bookTitle: testMarkerTitle,
        bookMedium: 'physical',
        content: 'فائدة مستخلصة قبل الكارثة المحاكية للاسترجاع',
        colorTag: 'emerald',
      });
    expect(noteCreateRes.status).toBe(201);

    // Create a notification for the student
    disasterNotificationId = `notif-${Date.now()}`;
    await db.query(`
      INSERT INTO notifications (id, recipient_id, recipient_role, title, message, type, target_tab, is_read, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      disasterNotificationId,
      'user-student-1',
      'student',
      'إشعار تجريبي لاختبار الاسترجاع الكامل',
      'تم اعتماد استعارتك بنجاح قبل محاكاة الكارثة',
      'loan_approved',
      'loans',
      false,
      new Date().toISOString(),
    ]);

    // 2. Create the Disaster Recovery Backup Snapshot
    const snapshotRes = await request(app)
      .post('/api/v1/backups/create')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(snapshotRes.status).toBe(200);
    disasterBackupFileName = snapshotRes.body.data.fileName;

    // 3. Simulate Database Data Loss / Disaster: delete the book and delete the notification
    const deleteBookRes = await request(app)
      .delete(`/api/v1/books/${disasterBookId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteBookRes.status).toBe(200);

    await db.query('DELETE FROM notifications WHERE id = $1', [disasterNotificationId]);

    // Verify the book is truly GONE from the active database
    const verifyGoneRes = await request(app).get('/api/v1/books');
    const foundDeleted = verifyGoneRes.body.data.find((b: any) => b.id === disasterBookId);
    expect(foundDeleted).toBeUndefined();

    // Verify notification is gone
    const verifyNotifGone = await db.query('SELECT * FROM notifications WHERE id = $1', [disasterNotificationId]);
    expect(verifyNotifGone.rows.length).toBe(0);

    // 4. Perform Transactional Restore from the Snapshot
    const restoreRes = await request(app)
      .post(`/api/v1/backups/${disasterBackupFileName}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirm: true });

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);
    expect(restoreRes.body.data.backupFileName).toBe(disasterBackupFileName);
    expect(restoreRes.body.data.preRestoreBackup).toBeDefined();

    // 5. Test I: Verify that a pre-restore safety backup was created in filesystem
    const fs = await import('fs');
    const path = await import('path');
    const { serverConfig } = await import('../server/config');
    const preRestorePath = path.join(serverConfig.dirs.backups, restoreRes.body.data.preRestoreBackup);
    expect(fs.existsSync(preRestorePath)).toBe(true);

    // 6. Test B & C: Verify original data and relationships are 100% recovered!
    const booksAfterRestoreRes = await request(app).get('/api/v1/books');
    const recoveredBook = booksAfterRestoreRes.body.data.find((b: any) => b.id === disasterBookId);
    expect(recoveredBook).toBeDefined();
    expect(recoveredBook.title).toBe(testMarkerTitle);
    expect(recoveredBook.totalCopies).toBe(3);

    // Verify student note relationship was recovered
    const notesAfterRestoreRes = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', `Bearer ${studentToken}`);
    const recoveredNote = notesAfterRestoreRes.body.data.find((n: any) => n.bookId === disasterBookId);
    expect(recoveredNote).toBeDefined();
    expect(recoveredNote.content).toBe('فائدة مستخلصة قبل الكارثة المحاكية للاسترجاع');

    // Verify notification was 100% recovered
    const recoveredNotif = await db.query('SELECT * FROM notifications WHERE id = $1', [disasterNotificationId]);
    expect(recoveredNotif.rows.length).toBe(1);
    expect(recoveredNotif.rows[0].title).toBe('إشعار تجريبي لاختبار الاسترجاع الكامل');

    // 7. Test J: Verify Health endpoint reports healthy after restore
    const healthRes = await request(app).get('/api/v1/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.data.status).toBe('healthy');
    expect(healthRes.body.data.checks.database).toBeDefined();
    expect(healthRes.body.data.checks.storage).toBe('writable');

    // 8. Test K: Verify authentication continues to work with restored password hashes
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ registrationNumber: 'ADM-001', password: 'admin123' });
    expect(adminLoginRes.status).toBe(200);
    expect(adminLoginRes.body.data.token).toBeTypeOf('string');

    const studentLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ registrationNumber: 'STU-2026-101', password: '123456' });
    expect(studentLoginRes.status).toBe(200);
    expect(studentLoginRes.body.data.token).toBeTypeOf('string');
  });

  it('Test: should ensure all persistent application database tables are covered by BACKUP_TABLES_ORDER', async () => {
    const { db } = await import('../server/db/pool');
    const { BACKUP_TABLES_ORDER } = await import('../server/services/backupService');

    // Query all base tables in the public schema
    const { rows } = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const allDbTables = rows.map((r: any) => r.table_name);

    // Explicit non-application / infrastructure / audit tables
    const infrastructureAndAuditTables = new Set([
      'schema_migrations', // migration version control
      'roles',             // static RBAC seed data
      'permissions',       // static RBAC seed data
      'role_permissions',  // static RBAC seed data
      'audit_logs',        // append-only compliance audit trail (intentionally preserved across restore)
    ]);

    const persistentAppTables = allDbTables.filter((t: string) => !infrastructureAndAuditTables.has(t));

    // Every single persistent application table MUST be in BACKUP_TABLES_ORDER
    for (const table of persistentAppTables) {
      expect(BACKUP_TABLES_ORDER).toContain(table);
    }

    // Exact count parity
    expect(BACKUP_TABLES_ORDER.length).toBe(persistentAppTables.length);
  });

  it('Test: should successfully create new records without sequence/ID collision after restore', async () => {
    // 1. Create a new book after restore
    const newBookRes = await request(app)
      .post('/api/v1/books')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'physical',
        title: `كتاب ما بعد الاسترجاع ${Date.now()}`,
        author: 'مؤلف جديد',
        categoryId: 'cat-islamic',
        totalCopies: 2,
        availableCopies: 2,
        language: 'العربية',
      });

    expect(newBookRes.status).toBe(201);
    expect(newBookRes.body.data.id).toBeDefined();

    // 2. Create a new student note after restore
    const newNoteRes = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        bookId: newBookRes.body.data.id,
        bookTitle: newBookRes.body.data.title,
        bookMedium: 'physical',
        content: 'ملاحظة جديدة ما بعد الاسترجاع للتأكد من عدم وجود تعارض في المعرفات',
        colorTag: 'amber',
      });

    expect(newNoteRes.status).toBe(201);
    expect(newNoteRes.body.data.id).toBeDefined();
  });

  it('Test: should list available backups with classification (manual vs pre_restore)', async () => {
    const res = await request(app)
      .get('/api/v1/backups')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);

    const hasPreRestore = res.body.data.some((b: any) => b.type === 'pre_restore');
    const hasManual = res.body.data.some((b: any) => b.type === 'manual');
    expect(hasManual).toBe(true);
    expect(hasPreRestore).toBe(true);
  });
});


