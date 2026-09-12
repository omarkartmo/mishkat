import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import path from 'path';
import fs from 'fs';
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
