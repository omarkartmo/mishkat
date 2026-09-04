/**
 * MISHKAT — Phase 15.4-I Test Suite
 * Digital Book Ingestion Foundation: Single Upload, Bulk Ingestion & Incoming Watcher
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Express } from 'express';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';
import { serverConfig } from '../server/config';

let app: Express;
let adminToken: string;
let studentToken: string;

const testNonce = Date.now();
const testPdfContent = Buffer.from(
  `%PDF-1.4\n1 0 obj\n<< /Title (Diwan Ibn Raziq ${testNonce}) /Author (Ibn Raziq) >>\nendobj\n` +
  '2 0 obj\n<< /Length 550 >>\nstream\n' +
  `BT /F1 12 Tf 50 750 Td (Mishkat Digital Repository Test ${testNonce}) Tj ET\n` +
  ' '.repeat(550) +
  '\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
);
const testPdfHash = crypto.createHash('sha256').update(testPdfContent).digest('hex');

beforeAll(async () => {
  app = await createExpressApp();

  // Admin login
  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });
  adminToken = adminLogin.body.data.token;

  // Student login
  const studentLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });
  studentToken = studentLogin.body.data.token;

  // Ensure incoming dir exists
  if (!fs.existsSync(serverConfig.dirs.incoming)) {
    fs.mkdirSync(serverConfig.dirs.incoming, { recursive: true });
  }
});

describe('Phase 15.4-I: Digital Book Ingestion Foundation', () => {
  let uploadedFilePath: string;
  let uploadedFileHash: string;
  let createdBookId: string;

  describe('1. Single Upload Route (POST /api/v1/books/upload)', () => {
    it('rejects unauthenticated upload requests with 401', async () => {
      const res = await request(app)
        .post('/api/v1/books/upload')
        .attach('file', testPdfContent, 'test-unauth.pdf');

      expect(res.status).toBe(401);
    });

    it('rejects student upload requests with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/books/upload')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('file', testPdfContent, 'test-student.pdf');

      expect(res.status).toBe(403);
    });

    it('allows admin upload and returns sha256, filePath, and metadata', async () => {
      const filename = `single-upload-${testNonce}.pdf`;
      const res = await request(app)
        .post('/api/v1/books/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', testPdfContent, filename);

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('filePath');
      expect(res.body.data).toHaveProperty('sha256');
      expect(res.body.data.sha256).toBe(testPdfHash);
      expect(res.body.data.format).toBe('pdf');

      uploadedFilePath = res.body.data.filePath;
      uploadedFileHash = res.body.data.sha256;

      // Verify file is saved in digital library root
      expect(fs.existsSync(uploadedFilePath)).toBe(true);
    });

    it('creates a digital book using the uploaded file info', async () => {
      // Find a valid category
      const catRes = await request(app)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`);
      const categoryId = catRes.body.data[0]?.id || 'cat-general';

      const res = await request(app)
        .post('/api/v1/books')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `ديوان ابن رزيق ${testNonce}`,
          author: 'حميد بن محمد بن رزيق',
          categoryId: categoryId,
          type: 'digital',
          format: 'pdf',
          fileUrl: `/files/digital/${path.basename(uploadedFilePath)}`,
          filePath: uploadedFilePath,
          fileHash: uploadedFileHash,
          fileSizeMb: (testPdfContent.length / (1024 * 1024)).toFixed(2),
          source: 'local_upload',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      createdBookId = res.body.data.id;
      expect(createdBookId).toBeDefined();

      // Verify book can be retrieved
      const bookRes = await request(app)
        .get(`/api/v1/books/${createdBookId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(bookRes.status).toBe(200);
      expect(bookRes.body.data.title).toContain('ديوان ابن رزيق');
      expect(bookRes.body.data.file_path).toBe(uploadedFilePath);
    });
  });

  describe('2. Incoming Watcher & Observability Endpoints', () => {
    it('restricts GET /api/v1/system/incoming-status to admins (403 for students)', async () => {
      const res = await request(app)
        .get('/api/v1/system/incoming-status')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('returns watcher status and staging queue list for admin', async () => {
      const res = await request(app)
        .get('/api/v1/system/incoming-status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.watcher).toBeDefined();
      expect(res.body.data.watcher.incomingDir).toBeDefined();
      expect(Array.isArray(res.body.data.queue)).toBe(true);
    });
  });

  describe('3. Incoming Directory Scan, Duplicate Detection & Staging', () => {
    const stagedFileName = `incoming-test-${testNonce}.pdf`;
    const stagedFileContent = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Title (Tuhfat Al-A'yan ${testNonce}) /Author (Al-Salimi) >>\nendobj\n` +
      '2 0 obj\n<< /Length 500 >>\nstream\n' +
      `BT /F1 12 Tf 50 750 Td (Incoming Watcher Test Document ${testNonce}) Tj ET\n` +
      ' '.repeat(500) +
      '\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
    );
    const stagedFilePath = path.join(serverConfig.dirs.incoming, stagedFileName);

    let stagedQueueId: string;

    beforeAll(() => {
      fs.writeFileSync(stagedFilePath, stagedFileContent);
    });

    afterAll(() => {
      if (fs.existsSync(stagedFilePath)) {
        fs.unlinkSync(stagedFilePath);
      }
    });

    it('scans incoming folder and stages newly detected file', async () => {
      const res = await request(app)
        .post('/api/v1/system/incoming-scan')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.found).toBeGreaterThanOrEqual(1);

      // Check the queue
      const statusRes = await request(app)
        .get('/api/v1/system/incoming-status')
        .set('Authorization', `Bearer ${adminToken}`);

      const queuedItem = statusRes.body.data.queue.find(
        (item: any) => item.originalFilename === stagedFileName
      );

      expect(queuedItem).toBeDefined();
      expect(queuedItem.format).toBe('pdf');
      expect(queuedItem.status).toBe('PENDING_REVIEW');
      stagedQueueId = queuedItem.id;
    });

    it('rejects unauthorized students from triggering manual scan (403)', async () => {
      const res = await request(app)
        .post('/api/v1/system/incoming-scan')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('allows admin to approve and import staged book into digital library', async () => {
      expect(stagedQueueId).toBeDefined();

      const catRes = await request(app)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`);
      const categoryId = catRes.body.data[0]?.id || 'cat-general';

      const importRes = await request(app)
        .post(`/api/v1/system/staging-queue/${stagedQueueId}/import`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `تحفة الأعيان بسيرة أهل عمان ${testNonce}`,
          author: 'عبد الله بن حميد السالمي',
          categoryId: categoryId,
        });

      expect(importRes.status).toBe(200);
      expect(importRes.body.success).toBe(true);
      expect(importRes.body.data.bookId).toBeDefined();

      // Verify item status is now IMPORTED
      const statusRes = await request(app)
        .get('/api/v1/system/incoming-status')
        .set('Authorization', `Bearer ${adminToken}`);

      const updatedItem = statusRes.body.data.queue.find(
        (item: any) => item.id === stagedQueueId
      );
      expect(updatedItem.status).toBe('IMPORTED');

      // Verify file moved to digital library canonical root
      const importedCanonicalPath = path.join(serverConfig.dirs.digital, `${importRes.body.data.bookId}.pdf`);
      expect(fs.existsSync(importedCanonicalPath)).toBe(true);

      // Clean up canonical test file
      if (fs.existsSync(importedCanonicalPath)) {
        fs.unlinkSync(importedCanonicalPath);
      }
    });
  });

  describe('4. Staging Queue Item Rejection', () => {
    const rejectFileName = `incoming-reject-${testNonce}.pdf`;
    const rejectFileContent = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Title (Draft To Reject ${testNonce}) >>\nendobj\n` +
      '2 0 obj\n<< /Length 500 >>\nstream\n' +
      ' '.repeat(500) +
      '\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
    );
    const rejectFilePath = path.join(serverConfig.dirs.incoming, rejectFileName);
    let rejectQueueId: string;

    beforeAll(() => {
      fs.writeFileSync(rejectFilePath, rejectFileContent);
    });

    afterAll(() => {
      if (fs.existsSync(rejectFilePath)) {
        fs.unlinkSync(rejectFilePath);
      }
    });

    it('stages the file and allows admin to reject it with note', async () => {
      // Scan
      await request(app)
        .post('/api/v1/system/incoming-scan')
        .set('Authorization', `Bearer ${adminToken}`);

      const statusRes = await request(app)
        .get('/api/v1/system/incoming-status')
        .set('Authorization', `Bearer ${adminToken}`);

      const item = statusRes.body.data.queue.find(
        (q: any) => q.originalFilename === rejectFileName
      );
      expect(item).toBeDefined();
      rejectQueueId = item.id;

      // Reject
      const rejectRes = await request(app)
        .post(`/api/v1/system/staging-queue/${rejectQueueId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'نسخة غير واضحة المسح الضوئي' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.success).toBe(true);

      // Verify status is REJECTED
      const checkRes = await request(app)
        .get('/api/v1/system/incoming-status')
        .set('Authorization', `Bearer ${adminToken}`);
      const updated = checkRes.body.data.queue.find((q: any) => q.id === rejectQueueId);
      expect(updated.status).toBe('REJECTED');
      expect(updated.adminNotes).toBe('نسخة غير واضحة المسح الضوئي');
    });
  });
});
