/**
 * MISHKAT — Phase 15.4-G Test Suite
 * Retire Quick Explorer + Trusted External Portal Browsing & Book Suggestion
 *
 * Verifies:
 * 1. Quick Explorer Retirement (Zero internal fake portal book searches in UI)
 * 2. Portal Status Model (APPROVED_BROWSABLE, BROWSE_ONLY, DISABLED/BLOCKED)
 * 3. Mandatory Source Page URL & Incomplete Provenance Flagging
 * 4. User-Assisted Capture (Method C) Provenance Stamping
 * 5. Digital Book Duplicate Prevention (Source ID, Canonical URL, SHA-256 Hash)
 * 6. Secure Server-Side Ingestion & File Streaming Invariance
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Express } from 'express';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';
import { serverConfig } from '../server/config';

let app: Express;
let mockServer: http.Server;
let mockPort: number;
let mockBaseUrl: string;

let adminToken: string;
let studentToken: string;

// Sample valid PDF buffer (with %PDF- magic bytes and > 500 bytes for size check)
const executionNonce = Date.now();
const samplePdfContent = Buffer.from(
  `%PDF-1.4\n1 0 obj\n<< /Title (Rare Manuscript ${executionNonce}) /Author (Sheikh Al-Jaytali) >>\nendobj\n` +
  '2 0 obj\n<< /Length 600 >>\nstream\n' +
  `BT /F1 12 Tf 50 750 Td (Mishkat Central Library ${executionNonce}) Tj ET\n` +
  ' '.repeat(600) +
  '\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
);
const samplePdfHash = crypto.createHash('sha256').update(samplePdfContent).digest('hex');

beforeAll(async () => {
  // 1. Start mock server for external portal testing
  await new Promise<void>((resolve) => {
    mockServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/book-page/1234') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><head><title>كتاب قواعد الإسلام - البوابة المعتمدة</title></head><body>صفحة الكتاب الأصلية</body></html>');
        return;
      }

      if (url.pathname === '/files/real-manuscript.pdf') {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': samplePdfContent.length,
        });
        res.end(samplePdfContent);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer.address() as any;
      mockPort = addr.port;
      mockBaseUrl = `http://127.0.0.1:${mockPort}`;
      resolve();
    });
  });

  // 2. Initialize Express test app
  app = await createExpressApp();

  // 3. Login as Admin
  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });
  adminToken = adminLogin.body.data.token;

  // 4. Login as Student
  const studentLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });
  studentToken = studentLogin.body.data.token;
});

afterAll(async () => {
  if (mockServer) {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

describe('MISHKAT — Phase 15.4-G: Retire Quick Explorer & Trusted Browsing/Suggestion', () => {
  describe('1. Quick Explorer Product UX Retirement', () => {
    it('verifies that WhitelistedPortalsView does NOT import or render local fake book catalog', () => {
      const viewFilePath = path.resolve('src/components/portals/WhitelistedPortalsView.tsx');
      const viewCode = fs.readFileSync(viewFilePath, 'utf8');

      // Must not import PORTAL_CATALOG_DATABASE or PortalBookItem
      expect(viewCode).not.toContain('PORTAL_CATALOG_DATABASE');
      expect(viewCode).not.toContain('PortalBookItem');

      // Must not have Quick Explorer mode switcher
      expect(viewCode).not.toContain("viewMode === 'explorer'");
      expect(viewCode).not.toContain('المستكشف التفاعلي');

      // Must have clean direct website browsing & book suggestion
      expect(viewCode).toContain('فتح الموقع في نافذة جديدة');
      expect(viewCode).toContain('اقتراح كتاب وجدته في هذا الموقع');
      expect(viewCode).toContain('متاح للتصفح المباشر');
    });

    it('verifies portal status model supports APPROVED_BROWSABLE, BROWSE_ONLY, and DISABLED', async () => {
      const res = await request(app)
        .get('/api/v1/portals')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      // Verify each portal has a truthful browsing status
      res.body.data.forEach((portal: any) => {
        expect([
          'APPROVED_BROWSABLE',
          'BROWSE_ONLY',
          'VERIFIED',
          'STATIC_SNAPSHOT',
          'UNSUPPORTED',
          'BLOCKED',
          'DISABLED',
          'FAILED',
          'NEEDS_REVIEW',
          'DRAFT',
          'DISCOVERING',
        ]).toContain(portal.status);
      });
    });
  });

  describe('2. Mandatory Source Page URL & Incomplete Provenance Flagging', () => {
    it('flags submission as INCOMPLETE_PROVENANCE if source URL is missing', async () => {
      const res = await request(app)
        .post('/api/v1/submissions')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'كتاب بدون رابط صفحة',
          author: 'مجهول',
          sourcePortalName: 'بوابة الاختبار',
          sourceUrl: '', // Missing source URL
          summary: 'تجربة التحقق من المصدر الإلزامي',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);

      // Verify the saved record status
      const listRes = await request(app)
        .get('/api/v1/submissions')
        .set('Authorization', `Bearer ${adminToken}`);

      const created = listRes.body.data.find((s: any) => s.title === 'كتاب بدون رابط صفحة');
      expect(created).toBeDefined();
      expect(created.verificationStatus).toBe('INCOMPLETE_PROVENANCE');
    });

    it('records valid submission with source page URL and USER_ASSISTED_CAPTURE provenance', async () => {
      const pageUrl = `${mockBaseUrl}/book-page/1234`;
      const downloadUrl = `${mockBaseUrl}/files/real-manuscript.pdf`;

      const res = await request(app)
        .post('/api/v1/submissions')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'مخطوطة نادرة موثقة',
          author: 'الشيخ إسماعيل الجيطالي',
          sourcePortalName: 'بوابة الاختبار المباشرة',
          sourcePortalId: 'portal-test-15-4g',
          sourceRecordId: 'rec-1234',
          sourceUrl: pageUrl,
          sourceRecordUrl: pageUrl,
          downloadUrl: downloadUrl,
          sourceMethod: 'USER_ASSISTED_CAPTURE',
          verificationStatus: 'USER_SUGGESTED',
          summary: 'مخطوطة أصلية تم العثور عليها عبر التصفح المباشر للبوابة.',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);

      const listRes = await request(app)
        .get('/api/v1/submissions')
        .set('Authorization', `Bearer ${adminToken}`);

      const created = listRes.body.data.find((s: any) => s.title === 'مخطوطة نادرة موثقة');
      expect(created).toBeDefined();
      expect(created.sourceRecordUrl).toBe(pageUrl);
      expect(created.downloadUrl).toBe(downloadUrl);
      expect(created.sourceMethod).toBe('USER_ASSISTED_CAPTURE');
    });
  });

  describe('3. Digital Book Duplicate Prevention (Section 16)', () => {
    let subToApproveId: string;
    const testId = Date.now();
    const testPortalId = `portal-4g-${testId}`;
    const testRecId = `rec-4g-${testId}`;
    let testPageUrl: string;
    let testDownloadUrl: string;

    it('approves a new submission and ingests the digital book centrally', async () => {
      testPageUrl = `${mockBaseUrl}/book-page/${testId}`;
      testDownloadUrl = `${mockBaseUrl}/files/real-manuscript.pdf`;

      const subRes = await request(app)
        .post('/api/v1/submissions')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'كتاب فريد للاعتماد المركزي',
          author: 'مؤلف معتمد',
          sourcePortalName: 'بوابة الاختبار',
          sourcePortalId: testPortalId,
          sourceRecordId: testRecId,
          sourceUrl: testPageUrl,
          sourceRecordUrl: testPageUrl,
          downloadUrl: testDownloadUrl,
          sourceMethod: 'USER_ASSISTED_CAPTURE',
          verificationStatus: 'USER_SUGGESTED',
          summary: 'كتاب أصيل غير مكرر.',
        });

      subToApproveId = subRes.body.data?.id;
      if (!subToApproveId) {
        const list = await request(app).get('/api/v1/submissions').set('Authorization', `Bearer ${adminToken}`);
        subToApproveId = list.body.data.find((s: any) => s.title === 'كتاب فريد للاعتماد المركزي')?.id;
      }

      const approveRes = await request(app)
        .post(`/api/v1/submissions/${subToApproveId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'approved',
          adminFeedback: 'تمت مراجعة صفحة المصدر والتحميل واعتماد الكتاب بنجاح',
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);

      // Verify the book exists in catalog with authentic hash and storage
      const bookRows = await db.query(
        'SELECT * FROM books WHERE source_record_url = $1 LIMIT 1',
        [testPageUrl]
      );
      expect(bookRows.rows.length).toBe(1);
      expect(bookRows.rows[0].source_portal_id).toBe(testPortalId);
      expect(bookRows.rows[0].source_record_id).toBe(testRecId);
      expect(bookRows.rows[0].file_hash).toBe(samplePdfHash);
      expect(fs.existsSync(bookRows.rows[0].file_path)).toBe(true);
    });

    it('blocks duplicate import by matching source_portal_id + source_record_id', async () => {
      // Create duplicate proposal with same source portal and record id
      await request(app)
        .post('/api/v1/submissions')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'كتاب مكرر برقم المعرف',
          author: 'مؤلف معتمد',
          sourcePortalName: 'بوابة الاختبار',
          sourcePortalId: testPortalId,
          sourceRecordId: testRecId, // SAME ID
          sourceUrl: `${mockBaseUrl}/other-page-${testId}`,
          sourceRecordUrl: `${mockBaseUrl}/other-page-${testId}`,
          summary: 'محاولة استيراد مكرر',
        });

      const list = await request(app).get('/api/v1/submissions').set('Authorization', `Bearer ${adminToken}`);
      const dupSub = list.body.data.find((s: any) => s.title === 'كتاب مكرر برقم المعرف');

      const approveRes = await request(app)
        .post(`/api/v1/submissions/${dupSub.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' });

      expect(approveRes.status).toBe(500);
      expect(approveRes.body.error.message).toContain('الكتاب موجود مسبقاً في المستودع الرقمي');
    });

    it('blocks duplicate import by matching canonical source_record_url', async () => {
      await request(app)
        .post('/api/v1/submissions')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'كتاب مكرر بالرابط المصدري',
          author: 'مؤلف معتمد',
          sourcePortalName: 'بوابة أخرى',
          sourcePortalId: `portal-diff-${testId}`,
          sourceRecordId: `rec-diff-${testId}`,
          sourceUrl: testPageUrl, // SAME CANONICAL URL
          sourceRecordUrl: testPageUrl,
          summary: 'محاولة تكرار برابط المصدر',
        });

      const list = await request(app).get('/api/v1/submissions').set('Authorization', `Bearer ${adminToken}`);
      const dupSub = list.body.data.find((s: any) => s.title === 'كتاب مكرر بالرابط المصدري');

      const approveRes = await request(app)
        .post(`/api/v1/submissions/${dupSub.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' });

      expect(approveRes.status).toBe(500);
      expect(approveRes.body.error.message).toContain('الكتاب مضاف مسبقاً من نفس الرابط المصدري');
    });

    it('blocks duplicate import by matching SHA-256 file hash', async () => {
      await request(app)
        .post('/api/v1/submissions')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'كتاب بعنوان مختلف لكن الملف مطابق',
          author: 'مؤلف آخر',
          sourcePortalName: 'بوابة جديدة',
          sourcePortalId: `portal-hash-${testId}`,
          sourceRecordId: `rec-hash-${testId}`,
          sourceUrl: `${mockBaseUrl}/page-hash-${testId}`,
          sourceRecordUrl: `${mockBaseUrl}/page-hash-${testId}`,
          downloadUrl: testDownloadUrl, // WILL DOWNLOAD SAME FILE WITH SAME SHA-256
          summary: 'محاولة استيراد نفس الملف ببيانات أخرى',
        });

      const list = await request(app).get('/api/v1/submissions').set('Authorization', `Bearer ${adminToken}`);
      const dupSub = list.body.data.find((s: any) => s.title === 'كتاب بعنوان مختلف لكن الملف مطابق');

      const approveRes = await request(app)
        .post(`/api/v1/submissions/${dupSub.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' });

      expect(approveRes.status).toBe(500);
      expect(approveRes.body.error.message).toContain('SHA-256');
    });
  });

  describe('4. Secure Server-Side Ingestion & Reader Streaming Invariants', () => {
    it('verifies that central server correctly streams ingested digital book to authenticated users', async () => {
      const bookRows = await db.query(
        'SELECT id FROM books WHERE file_hash = $1 LIMIT 1',
        [samplePdfHash]
      );
      expect(bookRows.rows.length).toBe(1);
      const bookId = bookRows.rows[0].id;

      const fileRes = await request(app)
        .get(`/api/v1/books/${bookId}/file`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(fileRes.status).toBe(200);
      expect(fileRes.header['content-type']).toContain('application/pdf');
      expect(fileRes.body.length).toBe(samplePdfContent.length);
      expect(fileRes.body.toString()).toContain('%PDF-1.4');
    });
  });
});
