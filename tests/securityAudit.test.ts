import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';
import { isPrivateOrReservedHost, isPrivateOrReservedIp, validateSafeUrl } from '../server/services/portals/securityHttpClient';
import { isSystemDangerousPath, verifyFileMagicBytes } from '../server/utils/pathSafety';

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
  adminToken = adminLoginRes.body.data.token;

  // Ensure development seed passwords are consistently active for test suite
  const defaultStudentHash = await bcrypt.hash('123456', 10);
  await db.query(
    "UPDATE users SET password_hash = $1, token_version = 1 WHERE registration_number IN ('STU-2026-101', 'STU-2026-102')",
    [defaultStudentHash]
  );

  // 2. Authenticate Student A
  const studentLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });
  expect(studentLoginRes.status).toBe(200);
  studentToken = studentLoginRes.body.data.token;
  studentId = studentLoginRes.body.data.user.id;

  // 3. Authenticate Student B
  const studentBLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-102', password: '123456' });
  expect(studentBLoginRes.status).toBe(200);
  studentBToken = studentBLoginRes.body.data.token;
  studentBId = studentBLoginRes.body.data.user.id;

  // 4. Create an authoritative book for loan and inventory testing
  const createBookRes = await request(app)
    .post('/api/v1/books')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      type: 'physical',
      title: 'كتاب اختبارات الأمان السيبراني',
      author: 'مهندس الأمن الرقمي',
      categoryId: 'cat-science',
      totalCopies: 3,
      availableCopies: 3,
      language: 'العربية',
    });
  expect(createBookRes.status).toBe(201);
  testBookId = createBookRes.body.data.id;
});

describe('Security Audit Suite: VULN-01 Client IP & Rate Limiter Spoofing Defense', () => {
  it('Rate limiter helper respects trust proxy setting and extracts direct remoteAddress', async () => {
    const { getClientIp } = await import('../server/middleware/rateLimiter');
    const mockReqWithoutProxy: any = {
      app: { get: (k: string) => (k === 'trust proxy' ? false : undefined) },
      headers: { 'x-forwarded-for': '203.0.113.195, 198.51.100.1' },
      socket: { remoteAddress: '192.168.1.50' },
      ip: '192.168.1.50',
    };
    expect(getClientIp(mockReqWithoutProxy)).toBe('192.168.1.50');

    const mockReqWithProxy: any = {
      app: { get: (k: string) => (k === 'trust proxy' ? true : undefined) },
      headers: { 'x-forwarded-for': '203.0.113.195, 198.51.100.1' },
      socket: { remoteAddress: '127.0.0.1' },
      ip: '203.0.113.195',
    };
    expect(getClientIp(mockReqWithProxy)).toBe('203.0.113.195');
  });
});

describe('Security Audit Suite: VULN-02 Cross-Student IDOR Prevention', () => {
  let noteAId: string;
  let summaryAId: string;
  let bookmarkAId: string;

  it('Student A creates a private note', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        bookId: testBookId,
        bookTitle: 'كتاب اختبارات الأمان السيبراني',
        content: 'ملاحظة خاصة بالطالب أ لا يمكن التعديل عليها من غيره',
        color: 'amber',
        privacy: 'private',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    noteAId = res.body.data.id;
  });

  it('Student B cannot overwrite Student A note via PUT (IDOR Defense)', async () => {
    const res = await request(app)
      .put(`/api/v1/notes/${noteAId}`)
      .set('Authorization', `Bearer ${studentBToken}`)
      .send({
        content: 'محاولة اختراق وتعديل ملاحظة الطالب أ',
      });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Student B cannot delete Student A note via DELETE (IDOR Defense)', async () => {
    const res = await request(app)
      .delete(`/api/v1/notes/${noteAId}`)
      .set('Authorization', `Bearer ${studentBToken}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Student B cannot overwrite Student A note via POST upsert (IDOR Conflict Defense)', async () => {
    const res = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${studentBToken}`)
      .send({
        id: noteAId,
        bookId: testBookId,
        content: 'محاولة استبدال خبيثة لمعرف الملاحظة',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Student A creates a book summary', async () => {
    const res = await request(app)
      .post('/api/v1/summaries')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        bookId: testBookId,
        bookTitle: 'كتاب اختبارات الأمان السيبراني',
        title: 'تلخيص شامل من الطالب أ',
        mainIdea: 'الأمان السيبراني يبدأ من التحقق الصارم من الصلاحيات',
      });
    expect(res.status).toBe(201);
    summaryAId = res.body.data.id;
  });

  it('Student B cannot overwrite Student A summary via POST with existing ID (IDOR Defense)', async () => {
    const res = await request(app)
      .post('/api/v1/summaries')
      .set('Authorization', `Bearer ${studentBToken}`)
      .send({
        id: summaryAId,
        bookId: testBookId,
        title: 'محاولة استبدال ملخص طالب آخر',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Student B cannot delete Student A summary via DELETE (IDOR Defense)', async () => {
    const res = await request(app)
      .delete(`/api/v1/summaries/${summaryAId}`)
      .set('Authorization', `Bearer ${studentBToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Student A creates a physical bookmark', async () => {
    const res = await request(app)
      .post('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        bookId: testBookId,
        bookTitle: 'كتاب اختبارات الأمان السيبراني',
        currentPage: 42,
        totalPages: 200,
        quickNote: 'صفحة 42 مهمة جداً',
      });
    expect(res.status).toBe(201);
    bookmarkAId = res.body.data.id;
  });

  it('Student B cannot overwrite Student A bookmark via POST (IDOR Defense)', async () => {
    const res = await request(app)
      .post('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${studentBToken}`)
      .send({
        id: bookmarkAId,
        bookId: testBookId,
        currentPage: 99,
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Student B cannot delete Student A bookmark via DELETE (IDOR Defense)', async () => {
    const res = await request(app)
      .delete(`/api/v1/bookmarks/${bookmarkAId}`)
      .set('Authorization', `Bearer ${studentBToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('Security Audit Suite: VULN-03 Double Return Inventory Inflation & Loan Extension Defense', () => {
  let activeLoanId: string;

  it('Issues a loan and decrements available copies', async () => {
    const loanRes = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bookId: testBookId,
        studentId: studentId,
        loanDurationDays: 7,
      });
    expect(loanRes.status).toBe(201);
    activeLoanId = loanRes.body.data.id;

    const bookCheck = await db.query('SELECT available_copies, total_copies FROM books WHERE id = $1', [testBookId]);
    expect(bookCheck.rows[0].available_copies).toBe(2);
    expect(bookCheck.rows[0].total_copies).toBe(3);
  });

  it('First return succeeds and restores 1 copy', async () => {
    const returnRes = await request(app)
      .post(`/api/v1/loans/${activeLoanId}/return`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(returnRes.status).toBe(200);

    const bookCheck = await db.query('SELECT available_copies, total_copies FROM books WHERE id = $1', [testBookId]);
    expect(bookCheck.rows[0].available_copies).toBe(3);
  });

  it('Second return on already returned loan fails and DOES NOT inflate inventory copies', async () => {
    const returnAgainRes = await request(app)
      .post(`/api/v1/loans/${activeLoanId}/return`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(returnAgainRes.status).toBe(400);
    expect(returnAgainRes.body.error.code).toBe('RETURN_FAILED');

    // Available copies must still be 3, NEVER 4!
    const bookCheck = await db.query('SELECT available_copies, total_copies FROM books WHERE id = $1', [testBookId]);
    expect(bookCheck.rows[0].available_copies).toBe(3);
  });

  it('Cannot extend an already returned loan', async () => {
    const extendRes = await request(app)
      .post(`/api/v1/loans/${activeLoanId}/extend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ additionalDays: 7 });
    expect(extendRes.status).toBe(400);
    expect(extendRes.body.error.code).toBe('ALREADY_RETURNED');
  });

  it('Extending with negative or invalid days is rejected', async () => {
    // Create a new active loan to test invalid extension days
    const loanRes = await request(app)
      .post('/api/v1/loans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bookId: testBookId,
        studentId: studentBId,
        loanDurationDays: 7,
      });
    const newLoanId = loanRes.body.data.id;

    const invalidExtendRes = await request(app)
      .post(`/api/v1/loans/${newLoanId}/extend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ additionalDays: -10 });
    expect(invalidExtendRes.status).toBe(400);
    expect(invalidExtendRes.body.error.code).toBe('INVALID_DAYS');

    // Clean up loan
    await request(app)
      .post(`/api/v1/loans/${newLoanId}/return`)
      .set('Authorization', `Bearer ${adminToken}`);
  });
});

describe('Security Audit Suite: VULN-04 Magic-Bytes Upload Verification & Base64 Payload Limit', () => {
  it('Magic bytes validator detects valid PDF header (%PDF-)', () => {
    const tempPdf = path.join(process.cwd(), 'LibraryData', 'temp', 'test_valid.pdf');
    fs.writeFileSync(tempPdf, Buffer.from('%PDF-1.4\n%Test Content'));
    expect(verifyFileMagicBytes(tempPdf, 'pdf')).toBe(true);
    fs.unlinkSync(tempPdf);
  });

  it('Magic bytes validator rejects malicious executable disguised as PDF (MZ header)', () => {
    const tempExeAsPdf = path.join(process.cwd(), 'LibraryData', 'temp', 'malware.pdf');
    fs.writeFileSync(tempExeAsPdf, Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00'));
    expect(verifyFileMagicBytes(tempExeAsPdf, 'pdf')).toBe(false);
    fs.unlinkSync(tempExeAsPdf);
  });

  it('POST /api/v1/books/upload rejects file with fake PDF extension and malicious header', async () => {
    const fakePdfContent = Buffer.from('MZ\x90\x00\x03ThisIsNotAPdf');

    const res = await request(app)
      .post('/api/v1/books/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', fakePdfContent, 'document.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UPLOAD_UNSUPPORTED_FORMAT');
  });

  it('POST /api/v1/books/upload accepts legitimate PDF file', async () => {
    const legitimatePdf = Buffer.from('%PDF-1.5\n%Legitimate Educational Book Content\n%%EOF');

    const res = await request(app)
      .post('/api/v1/books/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', legitimatePdf, 'real_book.pdf');

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data.bookId).toBeDefined();
  });
});

describe('Security Audit Suite: VULN-05 Settings Route Traversal & Dangerous Path Protection', () => {
  it('Path safety detector flags dangerous OS system paths and drive roots', () => {
    expect(isSystemDangerousPath('C:\\')).toBe(true);
    expect(isSystemDangerousPath('c:\\windows')).toBe(true);
    expect(isSystemDangerousPath('C:\\Windows\\System32')).toBe(true);
    expect(isSystemDangerousPath('/etc')).toBe(true);
    expect(isSystemDangerousPath('/etc/shadow')).toBe(true);
    expect(isSystemDangerousPath('../../../etc')).toBe(true);
    expect(isSystemDangerousPath('LibraryData/books/digital')).toBe(false);
  });

  it('PUT /api/v1/settings blocks setting digitalBookRootUrl to sensitive OS directories', async () => {
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        digitalBookRootUrl: 'C:\\Windows\\System32',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ROOT_PATH');
  });

  it('PUT /api/v1/settings blocks allowedRoots containing system sensitive directories', async () => {
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        allowedRoots: ['C:\\Windows', 'LibraryData/books'],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ROOT_PATH');
  });

  it('PUT /api/v1/settings blocks invalid negative loan bounds', async () => {
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        generalReadingDurationDays: -15,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CONFIG');
  });
});

describe('Security Audit Suite: VULN-06 Information Disclosure Redaction in /health', () => {
  it('Unauthenticated GET /api/v1/health does not leak absolute server disk paths', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');

    // storagePaths must be defined for contract compatibility, but must NOT reveal host absolute paths
    const storage = res.body.data.storagePaths;
    expect(storage).toBeDefined();
    expect(storage.centralDirectory).not.toMatch(/^[A-Za-z]:\\/); // No Windows drive root path
    expect(storage.centralDirectory).not.toMatch(/^\/home\//);     // No Linux home path
    expect(storage.centralDirectory).toBe('LibraryData');
  });
});

describe('Security Audit Suite: VULN-07 SSRF Protection & IP Validation', () => {
  it('Detects and blocks private IPv4 subnets and cloud metadata IPs', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.5.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false); // Public DNS
    expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false); // Public DNS
  });

  it('Detects and blocks IPv6 loopback, link-local, and IPv4-mapped IPv6 addresses', () => {
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:192.168.0.1')).toBe(true);
  });

  it('Detects and blocks encoded decimal/hex representations of internal addresses', () => {
    expect(isPrivateOrReservedHost('2130706433')).toBe(true); // Decimal 127.0.0.1
    expect(isPrivateOrReservedHost('0x7f000001')).toBe(true);  // Hex 127.0.0.1
    expect(isPrivateOrReservedHost('metadata.google.internal')).toBe(true);
  });

  it('validateSafeUrl blocks SSRF target URLs in non-localhost mode', () => {
    expect(() => validateSafeUrl('http://169.254.169.254/latest/meta-data', { allowLocalhost: false })).toThrow(/SSRF_BLOCKED/);
    expect(() => validateSafeUrl('http://127.0.0.1:8080/admin', { allowLocalhost: false })).toThrow(/SSRF_BLOCKED/);
    expect(() => validateSafeUrl('ftp://external.org/book.pdf')).toThrow(/DISALLOWED_PROTOCOL/);
  });
});

describe('Security Audit Suite: VULN-10 Manual File Path Traversal Defense in Submissions', () => {
  it('Admin review rejects manualFilePath pointing outside allowed library directories', async () => {
    // Create a pending submission to review
    const subRes = await db.query(`
      INSERT INTO pending_submissions (
        id, student_id, student_name, student_reg_number, title, author, format, status, source_portal_name, submitted_at, created_at
      ) VALUES ('sub-sec-test-1', $1, 'طالب تجريبي', 'STU-2026-101', 'كتاب فحص المسار', 'مؤلف تجريبي', 'pdf', 'PENDING_REVIEW', 'بوابة الاختبار', '2026-09-12 10:00', NOW())
      RETURNING id;
    `, [studentId]);
    const subId = subRes.rows[0].id;

    const reviewRes = await request(app)
      .post(`/api/v1/submissions/${subId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'READY_FOR_FINAL_APPROVAL',
        manualFilePath: 'C:\\Windows\\System32\\cmd.exe',
      });

    expect(reviewRes.status).toBe(403);
    expect(reviewRes.body.error.code).toBe('ACCESS_DENIED');

    // Clean up
    await db.query('DELETE FROM pending_submissions WHERE id = $1', [subId]);
  });
});

describe('Security Audit Suite: Student Password Management & Session Invalidation', () => {
  let createdStudentId: string;
  let createdStudentReg: string;
  let generatedStudentPassword: string;
  let activeStudentSessionToken: string;

  it('Admin creates student without password: auto-generates secure password, hashes in DB, omits from audit', async () => {
    createdStudentReg = `STU-SEC-${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationNumber: createdStudentReg,
        name: 'طالب فحص كلمات المرور',
        grade: 'الصف الحادي عشر',
        role: 'student',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.generatedPassword).toBeDefined();
    expect(typeof createRes.body.data.generatedPassword).toBe('string');
    expect(createRes.body.data.generatedPassword.length).toBeGreaterThanOrEqual(8);
    
    // Check no visually ambiguous characters
    expect(createRes.body.data.generatedPassword).not.toMatch(/[0O1lIo]/);

    createdStudentId = createRes.body.data.id;
    generatedStudentPassword = createRes.body.data.generatedPassword;

    // Verify DB does NOT store plaintext password
    const { rows: userRows } = await db.query('SELECT password_hash, token_version FROM users WHERE id = $1', [createdStudentId]);
    expect(userRows.length).toBe(1);
    expect(userRows[0].password_hash).not.toBe(generatedStudentPassword);
    expect(userRows[0].password_hash.startsWith('$2')).toBe(true); // Valid bcrypt hash
    expect(userRows[0].token_version).toBe(1);

    // Verify Audit Log does NOT store plaintext password
    const { rows: auditRows } = await db.query(
      "SELECT metadata FROM audit_logs WHERE action = 'CREATE_USER' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1",
      [createdStudentId]
    );
    expect(auditRows.length).toBe(1);
    const auditDetails = typeof auditRows[0].metadata === 'string' ? auditRows[0].metadata : JSON.stringify(auditRows[0].metadata);
    expect(auditDetails).not.toContain(generatedStudentPassword);
  });

  it('Newly created student logs in successfully with generated password', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        registrationNumber: createdStudentReg,
        password: generatedStudentPassword,
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.token).toBeDefined();
    activeStudentSessionToken = loginRes.body.data.token;

    // Verify active session can access /auth/me
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${activeStudentSessionToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.id).toBe(createdStudentId);
  });

  let secondGeneratedPassword: string;

  it('Admin resets student password: auto-generates new password, bumps token_version, revokes old session', async () => {
    const resetRes = await request(app)
      .post(`/api/v1/users/${createdStudentId}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);
    expect(resetRes.body.data.generatedPassword).toBeDefined();
    expect(resetRes.body.data.student.id).toBe(createdStudentId);
    expect(resetRes.body.data.student.registrationNumber).toBe(createdStudentReg);

    secondGeneratedPassword = resetRes.body.data.generatedPassword;
    expect(secondGeneratedPassword).not.toBe(generatedStudentPassword);

    // Verify token_version bumped in DB
    const { rows: userRows } = await db.query('SELECT token_version FROM users WHERE id = $1', [createdStudentId]);
    expect(userRows[0].token_version).toBe(2);

    // Verify Old JWT session is immediately revoked (401 TOKEN_REVOKED)
    const revokedRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${activeStudentSessionToken}`);
    expect(revokedRes.status).toBe(401);
    expect(revokedRes.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('Student logs in with newly reset password and gets valid active session', async () => {
    // Old password now fails
    const failedLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        registrationNumber: createdStudentReg,
        password: generatedStudentPassword,
      });
    expect(failedLoginRes.status).toBe(401);

    // New password succeeds
    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        registrationNumber: createdStudentReg,
        password: secondGeneratedPassword,
      });
    expect(newLoginRes.status).toBe(200);
    const newSessionToken = newLoginRes.body.data.token;

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${newSessionToken}`);
    expect(meRes.status).toBe(200);
  });

  it('Student receives 403 Forbidden when attempting to reset or change any password', async () => {
    // Student attempts to reset another student password
    const studentResetOtherRes = await request(app)
      .post(`/api/v1/users/${studentId}/reset-password`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ newPassword: 'hackedPassword' });
    expect(studentResetOtherRes.status).toBe(403);
    expect(studentResetOtherRes.body.error.code).toBe('FORBIDDEN');

    // Student attempts to reset their own password via reset-password endpoint
    const studentResetSelfRes = await request(app)
      .post(`/api/v1/users/${studentBId}/reset-password`)
      .set('Authorization', `Bearer ${studentBToken}`)
      .send({ newPassword: 'newSelfPassword' });
    expect(studentResetSelfRes.status).toBe(403);
    expect(studentResetSelfRes.body.error.code).toBe('FORBIDDEN');

    // Student attempts to update user record via PUT /users/:id
    const studentPutRes = await request(app)
      .put(`/api/v1/users/${studentId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ password: 'newPasswordViaPut' });
    expect(studentPutRes.status).toBe(403);
    expect(studentPutRes.body.error.code).toBe('FORBIDDEN');

    // Student attempts to call admin security route
    const studentAdminSecRes = await request(app)
      .put('/api/v1/users/admin/security')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ newPassword: 'hackedPassword' });
    expect(studentAdminSecRes.status).toBe(403);
    expect(studentAdminSecRes.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /api/v1/users does not expose password hashes or plaintext passwords', async () => {
    const listRes = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const users = listRes.body.data;
    for (const u of users) {
      expect(u.password).toBeUndefined();
      expect(u.password_hash).toBeUndefined();
      expect(u.passwordHash).toBeUndefined();
    }
  });

  it('POST /api/v1/users/roster-import generates unique, random strong passwords and returns them for printing', async () => {
    const importRes = await request(app)
      .post('/api/v1/users/roster-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        students: [
          { registrationNumber: 'STU-BULK-001', name: 'طالب استيراد 1', grade: 'الصف العاشر' },
          { registrationNumber: 'STU-BULK-002', name: 'طالب استيراد 2', grade: 'الصف العاشر' },
        ],
      });
    expect(importRes.status).toBe(200);
    expect(importRes.body.success).toBe(true);
    const creds = importRes.body.data.generatedCredentials;
    expect(creds).toHaveLength(2);
    expect(creds[0].password).toBeDefined();
    expect(creds[1].password).toBeDefined();
    // Must not be predictable defaults
    expect(creds[0].password).not.toBe('123');
    expect(creds[0].password).not.toBe('123456');
    // Must be unique
    expect(creds[0].password).not.toBe(creds[1].password);
    expect(creds[0].password.length).toBeGreaterThanOrEqual(8);

    // Clean up
    await db.query("DELETE FROM users WHERE registration_number IN ('STU-BULK-001', 'STU-BULK-002')");
  });

  it('POST /api/v1/users/batch-reset-passwords generates strong random passwords and increments token_version', async () => {
    // Create dedicated student for batch reset test
    const testStuReg = `STU-BATCH-${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'طالب اختبار التعيين الجماعي',
        registrationNumber: testStuReg,
        grade: 'الصف الحادي عشر',
        role: 'student',
      });
    expect(createRes.status).toBe(201);
    const batchStudentId = createRes.body.data.id;
    const initialPass = createRes.body.data.generatedPassword;

    // Login to get an active token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ registrationNumber: testStuReg, password: initialPass });
    expect(loginRes.status).toBe(200);
    const tempSessionToken = loginRes.body.data.token;

    const batchRes = await request(app)
      .post('/api/v1/users/batch-reset-passwords')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentIds: [batchStudentId] });
    expect(batchRes.status).toBe(200);
    expect(batchRes.body.success).toBe(true);
    const resetUsers = batchRes.body.data.students;
    expect(resetUsers).toHaveLength(1);
    const newPass = resetUsers[0].password;
    expect(newPass).toBeDefined();
    expect(newPass).not.toBe('123');
    expect(newPass).not.toBe('123456');
    expect(newPass).not.toBe(initialPass);
    expect(newPass.length).toBeGreaterThanOrEqual(8);

    // Check token_version was incremented
    const afterUser = await db.query('SELECT token_version FROM users WHERE id = $1', [batchStudentId]);
    expect(afterUser.rows[0].token_version).toBe(2);

    // Old token should now be rejected (revoked)
    const authRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tempSessionToken}`);
    expect(authRes.status).toBe(401);

    // Clean up
    await db.query('DELETE FROM users WHERE id = $1', [batchStudentId]);
  });

  it('POST /api/v1/users/:id/reset-password rejects predictable "123" / "123456" and enforces strong random password', async () => {
    // Create dedicated student
    const testStuReg = `STU-WEAK-${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'طالب اختبار الحماية من كلمات المرور الضعيفة',
        registrationNumber: testStuReg,
        grade: 'الصف العاشر',
        role: 'student',
      });
    expect(createRes.status).toBe(201);
    const weakStudentId = createRes.body.data.id;

    const weakResetRes = await request(app)
      .post(`/api/v1/users/${weakStudentId}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: '123' });
    expect(weakResetRes.status).toBe(200);
    expect(weakResetRes.body.success).toBe(true);
    // Must NOT use 123
    const actualPass = weakResetRes.body.data.newPassword || weakResetRes.body.data.generatedPassword;
    expect(actualPass).not.toBe('123');
    expect(actualPass).not.toBe('123456');
    expect(actualPass.length).toBeGreaterThanOrEqual(8);

    // Clean up
    await db.query('DELETE FROM users WHERE id = $1', [weakStudentId]);
  });

  afterAll(async () => {
    if (createdStudentId) {
      await db.query('DELETE FROM users WHERE id = $1', [createdStudentId]);
    }
    // Restore default development student credentials
    const defaultStudentHash = await bcrypt.hash('123456', 10);
    await db.query(
      "UPDATE users SET password_hash = $1, token_version = 1 WHERE registration_number IN ('STU-2026-101', 'STU-2026-102')",
      [defaultStudentHash]
    );
  });
});

