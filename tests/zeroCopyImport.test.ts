import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';
import { serverConfig } from '../server/config';

describe('Zero-Copy In-Place Digital Book Import & Deletion Safety', () => {
  let app: any;
  let adminToken: string;
  const testExternalDir = path.join(process.cwd(), 'LibraryData', 'test_external_user_books');
  const subDir = path.join(testExternalDir, 'علوم_شرعية');

  beforeAll(async () => {
    app = await createExpressApp();
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ registrationNumber: 'ADM-001', password: 'admin123' });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.token;

    // Create external test directory simulating user's downloads folder (e.g. C:\Users\NABTAKIR\Downloads\كتب)
    fs.mkdirSync(subDir, { recursive: true });

    // Create test book files
    fs.writeFileSync(
      path.join(testExternalDir, 'كتاب رياض الصالحين - النووي.pdf'),
      '%PDF-1.4 Mock PDF content for in-place test\n%%EOF',
      'utf8'
    );
    fs.writeFileSync(
      path.join(subDir, 'زاد المعاد في هدي خير العباد - ابن القيم.pdf'),
      '%PDF-1.4 Mock PDF content inside subfolder\n%%EOF',
      'utf8'
    );
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(testExternalDir)) {
        fs.rmSync(testExternalDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('1. bulk-scan discovers files in external folder and subfolders without modifying or copying them', async () => {
    const res = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        folderPath: testExternalDir,
        limit: 10,
        excludeImported: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBe(2);

    const book1 = res.body.data.items.find((i: any) => i.title.includes('رياض الصالحين'));
    expect(book1).toBeDefined();
    expect(book1.stagedFilePath).toContain('رياض الصالحين');
    expect(fs.existsSync(book1.stagedFilePath)).toBe(true);

    const book2 = res.body.data.items.find((i: any) => i.title.includes('زاد المعاد'));
    expect(book2).toBeDefined();
    expect(book2.stagedFilePath).toContain('زاد المعاد');
  });

  it('2. bulk-import imports external file IN-PLACE without duplicating or creating extra copies on disk', async () => {
    // Check files in testExternalDir before import
    const filesBefore = fs.readdirSync(testExternalDir);

    const originalFilePath = path.join(testExternalDir, 'كتاب رياض الصالحين - النووي.pdf');
    const originalStat = fs.statSync(originalFilePath);

    // Scan to obtain staged item
    const scanRes = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        folderPath: testExternalDir,
        limit: 10,
        excludeImported: false,
      });

    const itemToImport = scanRes.body.data.items.find((i: any) => i.title.includes('رياض الصالحين'));
    expect(itemToImport).toBeDefined();

    // Import the item
    const importRes = await request(app)
      .post('/api/v1/books/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [itemToImport],
      });

    expect(importRes.status).toBe(201);
    expect(importRes.body.success).toBe(true);
    expect(importRes.body.data.imported).toBe(1);

    const importedId = importRes.body.data.details[0].id;
    const recordedFilePath = importRes.body.data.details[0].filePath;

    // Verify: recordedFilePath in database is the EXACT original file path!
    expect(path.resolve(recordedFilePath)).toBe(path.resolve(originalFilePath));

    // Verify: NO extra files were copied into testExternalDir (zero duplication!)
    const filesAfter = fs.readdirSync(testExternalDir);
    expect(filesAfter.length).toBe(filesBefore.length);
    // There should be no dig-*.pdf in the external directory
    const generatedCopies = filesAfter.filter((f) => f.startsWith('dig-'));
    expect(generatedCopies.length).toBe(0);

    // Verify: NO copy was created in default LibraryData/books/digital
    const defaultCopies = fs.existsSync(serverConfig.dirs.digital)
      ? fs.readdirSync(serverConfig.dirs.digital).filter((f) => f.startsWith(importedId))
      : [];
    expect(defaultCopies.length).toBe(0);

    // Verify original file is still intact
    expect(fs.existsSync(originalFilePath)).toBe(true);
    expect(fs.statSync(originalFilePath).size).toBe(originalStat.size);

    // Verify it streams cleanly via /api/v1/books/:id/file
    const streamRes = await request(app)
      .get(`/api/v1/books/${importedId}/file`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(streamRes.status).toBe(200);
    expect(streamRes.headers['content-type']).toContain('application/pdf');

    // 3. Verify Deletion Safety: Deleting the book from the catalog does NOT delete the external file on disk
    const deleteRes = await request(app)
      .delete(`/api/v1/books/${importedId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // The catalog record was deleted from DB
    const { rows: checkRows } = await db.query('SELECT id FROM books WHERE id = $1', [importedId]);
    expect(checkRows.length).toBe(0);

    // CRITICAL: The user's original physical file on disk MUST STILL EXIST!
    expect(fs.existsSync(originalFilePath)).toBe(true);
  });
});
