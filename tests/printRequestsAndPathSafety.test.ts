import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';
import { fixUploadedFileName, sanitizeRelativePath, getSafeUniqueFilePath } from '../server/utils/pathSafety';

let app: any;
let studentToken: string;
let adminToken: string;
let studentId: string;

describe('Digital Books UTF-8 Safety & Print Requests API Suite', () => {
  beforeAll(async () => {
    app = await createExpressApp();
    const { serverConfig } = await import('../server/config');
    const jwt = (await import('jsonwebtoken')).default;

    const userRes = await db.query("SELECT id, name, registration_number, role_id, token_version FROM users WHERE role_id = 'student' LIMIT 1");
    const studentUser = userRes.rows[0];
    studentId = studentUser ? studentUser.id : 'usr-test-student';

    studentToken = jwt.sign(
      {
        userId: studentId,
        registrationNumber: studentUser?.registration_number || '2024001',
        name: studentUser?.name || 'طالب اختباري',
        role: 'student',
        tokenVersion: studentUser?.token_version || 1,
        serverBootId: serverConfig.serverBootId,
      },
      serverConfig.jwtSecret,
      { expiresIn: '1h' }
    );

    const adminRes = await db.query("SELECT id, name, registration_number, role_id, token_version FROM users WHERE role_id = 'admin' LIMIT 1");
    const adminUser = adminRes.rows[0];

    adminToken = jwt.sign(
      {
        userId: adminUser?.id || 'usr-admin-1',
        registrationNumber: adminUser?.registration_number || 'admin',
        name: adminUser?.name || 'أمين المكتبة',
        role: 'admin',
        tokenVersion: adminUser?.token_version || 1,
        serverBootId: serverConfig.serverBootId,
      },
      serverConfig.jwtSecret,
      { expiresIn: '1h' }
    );
  });

  describe('1. Multer UTF-8 Filename Recovery & Path Safety', () => {
    it('accurately recovers Arabic filenames mangled by latin1 interpretation (Mojibake)', () => {
      const originalArabic = 'كتاب الطهارة والصلاة وأحكام النكاح.pdf';
      // Simulate Multer interpreting UTF-8 as latin1
      const mangledLatin1 = Buffer.from(originalArabic, 'utf8').toString('latin1');
      expect(mangledLatin1).not.toBe(originalArabic);

      const recovered = fixUploadedFileName(mangledLatin1);
      expect(recovered).toBe(originalArabic);
    });

    it('safely strips dangerous filesystem characters while preserving Arabic letters', () => {
      const dangerous = 'كتاب: الفقه* الميسر? <الجزء 1>.pdf';
      const sanitized = fixUploadedFileName(dangerous);
      expect(sanitized).toBe('كتاب_ الفقه_ الميسر_ _الجزء 1_.pdf');
      expect(/[\u0600-\u06FF]/.test(sanitized)).toBe(true);
    });

    it('sanitizes nested relative paths while preserving folder hierarchies', () => {
      const rawRelPath = 'كتب الفقه والتفسير\\المستوى الأول\\مقدمة.pdf';
      const sanitized = sanitizeRelativePath(rawRelPath);
      expect(sanitized).toBe('كتب الفقه والتفسير/المستوى الأول/مقدمة.pdf');
    });

    it('generates clean numbered suffixes (1) instead of cryptic hash strings on name collisions', () => {
      const testDir = path.join(process.cwd(), 'LibraryData', 'scratch_unique_test');
      fs.mkdirSync(testDir, { recursive: true });

      const file1 = path.join(testDir, 'رياض الصالحين.pdf');
      fs.writeFileSync(file1, 'first content');

      // Attempt to store a file with different content
      const { finalFileName, isDuplicate } = getSafeUniqueFilePath(testDir, 'رياض الصالحين.pdf', 'pdf', 'different-sha256');
      expect(finalFileName).toBe('رياض الصالحين (1).pdf');
      expect(isDuplicate).toBe(false);

      // Clean up
      try { fs.unlinkSync(file1); } catch {}
      try { fs.rmdirSync(testDir); } catch {}
    });
  });

  describe('2. Student Digital Book Print Request Workflow', () => {
    let createdRequestId: string;

    it('submits a valid digital book print request', async () => {
      const res = await request(app)
        .post('/api/v1/print-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookId: 'dig-sample-1',
          bookTitle: 'شرح رياض الصالحين',
          pageFrom: 12,
          pageTo: 18,
          purpose: 'بحث صفي',
          notes: 'طباعة على وجهين مع توضيح العناوين',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.book_title).toBe('شرح رياض الصالحين');
      expect(res.body.data.page_from).toBe(12);
      expect(res.body.data.page_to).toBe(18);
      expect(res.body.data.total_pages).toBe(7);
      expect(res.body.data.status).toBe('pending');

      createdRequestId = res.body.data.id;
    });

    it('rejects invalid page range where pageTo is less than pageFrom', async () => {
      const res = await request(app)
        .post('/api/v1/print-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookTitle: 'كتاب الفقه',
          pageFrom: 25,
          pageTo: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PAGES');
    });

    it('rejects requests exceeding institutional quota (100 pages)', async () => {
      const res = await request(app)
        .post('/api/v1/print-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookTitle: 'موسوعة الفقه',
          pageFrom: 1,
          pageTo: 150,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PAGE_LIMIT_EXCEEDED');
    });

    it('allows student to retrieve their own print requests', async () => {
      const res = await request(app)
        .get('/api/v1/print-requests')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((r: any) => r.id === createdRequestId);
      expect(found).toBeDefined();
    });

    it('allows librarian to approve request for printing and transition to ready_for_pickup', async () => {
      // Step 1: Librarian transitions to approved_printing
      const step1 = await request(app)
        .patch(`/api/v1/print-requests/${createdRequestId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved_printing', adminNotes: 'تم إرسال الملف للطابعة المكتبية' });

      expect(step1.status).toBe(200);
      expect(step1.body.data.status).toBe('approved_printing');

      // Step 2: Librarian transitions to ready_for_pickup
      const step2 = await request(app)
        .patch(`/api/v1/print-requests/${createdRequestId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ready_for_pickup', adminNotes: 'الأوراق جاهزة بمكتب الإعارة 1' });

      expect(step2.status).toBe(200);
      expect(step2.body.data.status).toBe('ready_for_pickup');

      // Step 3: Librarian confirms handover
      const step3 = await request(app)
        .patch(`/api/v1/print-requests/${createdRequestId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' });

      expect(step3.status).toBe(200);
      expect(step3.body.data.status).toBe('completed');
      expect(step3.body.data.completed_at).toBeDefined();
    });

    it('allows student to delete/cancel their own pending request', async () => {
      // Create a pending request
      const createRes = await request(app)
        .post('/api/v1/print-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookTitle: 'طلب للإلغاء',
          pageFrom: 1,
          pageTo: 5,
        });

      const tempId = createRes.body.data.id;

      // Cancel it
      const deleteRes = await request(app)
        .delete(`/api/v1/print-requests/${tempId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
    });
  });

  describe('3. Loan Request Cancellation & Digital Book HEAD Checks', () => {
    let testBookId: string;

    beforeAll(async () => {
      // Find a physical book to test loan requests
      const bookRes = await db.query("SELECT id FROM books WHERE type = 'physical' LIMIT 1");
      testBookId = bookRes.rows[0]?.id || 'pb-test-1';
    });

    it('allows a student to cancel their own pending loan request', async () => {
      const createRes = await request(app)
        .post('/api/v1/loan-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookId: testBookId,
          purpose: 'طلب تجريبي للإلغاء من الطالب',
          requestedDurationDays: 7,
        });

      expect(createRes.status).toBe(201);
      const reqId = createRes.body.data.id;

      const cancelRes = await request(app)
        .post(`/api/v1/loan-requests/${reqId}/cancel`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          reason: 'غيرت رأيي حول الكتاب',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.data.status).toBe('cancelled');
    });

    it('allows librarian/admin to cancel any loan request directly', async () => {
      const createRes = await request(app)
        .post('/api/v1/loan-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bookId: testBookId,
          purpose: 'طلب للإلغاء المباشر من الإدارة',
          requestedDurationDays: 5,
        });

      expect(createRes.status).toBe(201);
      const reqId = createRes.body.data.id;

      const cancelRes = await request(app)
        .post(`/api/v1/loan-requests/${reqId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'ألغي من قبل إدارة المكتبة لعدم توفر النسخة مؤقتاً',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.data.status).toBe('cancelled');
      expect(cancelRes.body.data.rejection_reason).toContain('إدارة المكتبة');
    });

    it('returns 404 on HEAD request when digital book file does not exist on disk', async () => {
      const headRes = await request(app)
        .head('/api/v1/books/non-existent-book-999/file')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(headRes.status).toBe(404);
    });
  });
});
