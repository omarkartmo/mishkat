/**
 * MISHKAT — Digital Library Reader Regression Test Suite
 * Phase 15.4-F: Authenticated Digital Streaming, Multi-Role Access & Mobile Compatibility
 *
 * Verifies:
 * 1. Admin opens PDF and receives authenticated stream (200 OK)
 * 2. Student opens PDF and receives authenticated stream (200 OK)
 * 3. Proper headers (Content-Type: application/pdf, Accept-Ranges: bytes, Content-Disposition)
 * 4. Missing file returns explicit 404 with Arabic error description
 * 5. Unauthorized request returns 401
 * 6. Range request returns 206 Partial Content with Content-Range
 * 7. Invalid book ID fails safely with 404
 * 8. Query parameter token authentication (?token=...) succeeds for direct browser streaming
 * 9. Reader does not expose the raw filesystem path
 * 10. EPUB format delivers application/epub+zip safely
 * 11. Path traversal security prevents access outside digital storage
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import fs from 'fs';
import path from 'path';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';
import { serverConfig } from '../server/config';

let app: Express;
let adminToken: string;
let studentToken: string;

const testPdfId = 'book-dig-reader-test-01';
const testPdfFilename = 'test-reader-sample.pdf';
const testEpubId = 'book-dig-reader-epub-01';
const testEpubFilename = 'test-reader-sample.epub';

beforeAll(async () => {
  app = await createExpressApp();

  // 1. Authenticate Admin
  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });
  expect(adminLogin.status).toBe(200);
  adminToken = adminLogin.body.data.token;

  // 2. Authenticate Student
  const studentLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });
  expect(studentLogin.status).toBe(200);
  studentToken = studentLogin.body.data.token;

  // 3. Ensure test PDF exists in central storage
  const testPdfPath = path.join(serverConfig.dirs.digital, testPdfFilename);
  const pdfHeaderBytes = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Size 1 >>\nstartxref\n50\n%%EOF';
  fs.writeFileSync(testPdfPath, pdfHeaderBytes, 'utf8');

  // 4. Ensure test EPUB exists
  const testEpubPath = path.join(serverConfig.dirs.digital, testEpubFilename);
  fs.writeFileSync(testEpubPath, 'PK\x03\x04mimetypeapplication/epub+zip', 'binary');

  // 5. Insert test books into Central Database
  await db.query(`
    INSERT INTO books (
      id, type, title, author, category_id, format, file_size, file_url, file_path,
      pages_count, summary, source_origin, uploaded_by, read_count
    ) VALUES 
      ($1, 'digital', 'كتاب القارئ النموذجي', 'أحمد بن ماجد', 'cat-science', 'pdf', '1.2 MB', $2, $3, 120, 'كتاب اختبار', 'المكتبة المركزية', 'admin-001', 0),
      ($4, 'digital', 'مخطوطة رقمية بصيغة إيباب', 'أبو بكر الخوارزمي', 'cat-science', 'epub', '800 KB', $5, $6, 85, 'إيباب اختبار', 'المكتبة المركزية', 'admin-001', 0)
    ON CONFLICT (id) DO UPDATE SET
      file_path = EXCLUDED.file_path,
      file_url = EXCLUDED.file_url;
  `, [
    testPdfId,
    `/api/v1/books/files/digital/${testPdfFilename}`,
    testPdfPath,
    testEpubId,
    `/api/v1/books/files/digital/${testEpubFilename}`,
    testEpubPath,
  ]);
});

describe('Digital Library Reader & Streaming Architecture (Phase 15.4-F)', () => {
  it('1. Admin receives full authenticated PDF stream (200 OK)', async () => {
    const res = await request(app)
      .get(`/api/v1/books/${testPdfId}/file`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.body.toString('utf8')).toContain('%PDF-1.4');
  });

  it('2. Student receives full authenticated PDF stream identically (200 OK)', async () => {
    const res = await request(app)
      .get(`/api/v1/books/${testPdfId}/file`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.body.toString('utf8')).toContain('%PDF-1.4');
  });

  it('3. Unauthenticated request without token is rejected with 401', async () => {
    const res = await request(app).get(`/api/v1/books/${testPdfId}/file`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('4. HTTP Range Request returns 206 Partial Content for both roles', async () => {
    // Admin Range Request (first 10 bytes)
    const adminRange = await request(app)
      .get(`/api/v1/books/${testPdfId}/file`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Range', 'bytes=0-9');

    expect(adminRange.status).toBe(206);
    expect(adminRange.headers['content-range']).toMatch(/^bytes 0-9\/\d+$/);
    expect(adminRange.headers['content-length']).toBe('10');
    expect(adminRange.headers['accept-ranges']).toBe('bytes');

    // Student Range Request (first 10 bytes)
    const studentRange = await request(app)
      .get(`/api/v1/books/${testPdfId}/file`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Range', 'bytes=0-9');

    expect(studentRange.status).toBe(206);
    expect(studentRange.headers['content-range']).toMatch(/^bytes 0-9\/\d+$/);
    expect(studentRange.headers['content-length']).toBe('10');
  });

  it('5. Missing file on disk returns explicit 404 with Arabic explanation', async () => {
    // Create record pointing to nonexistent file
    await db.query(`
      INSERT INTO books (
        id, type, title, author, category_id, format, file_size, file_path, pages_count, uploaded_by
      ) VALUES ('book-missing-file-01', 'digital', 'كتاب مفقود', 'مجهول', 'cat-science', 'pdf', '1 MB', 'C:\\nonexistent\\missing.pdf', 10, 'admin-001')
      ON CONFLICT (id) DO UPDATE SET file_path = 'C:\\nonexistent\\missing.pdf';
    `);

    const res = await request(app)
      .get('/api/v1/books/book-missing-file-01/file')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FILE_NOT_FOUND');
    expect(res.body.error.message).toContain('تعذر العثور على ملف الكتاب الرقمي');
  });

  it('6. Invalid book ID returns 404 safely', async () => {
    const res = await request(app)
      .get('/api/v1/books/nonexistent-book-id-9999/file')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FILE_NOT_FOUND');
  });

  it('7. Query token authentication (?token=...) enables direct browser/worker streaming', async () => {
    const res = await request(app).get(`/api/v1/books/${testPdfId}/file?token=${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.toString('utf8')).toContain('%PDF-1.4');
  });

  it('8. EPUB format delivers application/epub+zip with safe disposition', async () => {
    const res = await request(app)
      .get(`/api/v1/books/${testEpubId}/file`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/epub+zip');
    expect(res.headers['content-disposition']).toContain('epub');
  });

  it('9. Path traversal attempts are strictly denied (403 Forbidden)', async () => {
    // Attempt path traversal using relative directory manipulation
    await db.query(`
      INSERT INTO books (
        id, type, title, author, category_id, format, file_size, file_path, pages_count, uploaded_by
      ) VALUES ('book-traversal-01', 'digital', 'محاولة تسريب', 'مجهول', 'cat-science', 'pdf', '1 MB', $1, 10, 'admin-001')
      ON CONFLICT (id) DO UPDATE SET file_path = $1;
    `, [path.resolve(process.cwd(), 'package.json')]);

    const res = await request(app)
      .get('/api/v1/books/book-traversal-01/file')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ACCESS_DENIED');
  });

  it('10. Responses never expose internal filesystem paths', async () => {
    const res = await request(app)
      .get(`/api/v1/books/${testPdfId}/file`)
      .set('Authorization', `Bearer ${studentToken}`);

    // Verify response headers do not contain full system path
    const headerStr = JSON.stringify(res.headers);
    expect(headerStr).not.toContain('C:\\');
    expect(headerStr).not.toContain('/projects/mishkat');
  });
});
