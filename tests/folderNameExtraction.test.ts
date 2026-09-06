/**
 * MISHKAT — Folder-based Digital Book Extraction & Scanning Test Suite
 *
 * Verifies:
 * 1. Single book inside a folder with random hex name adopts folder name as title & author.
 * 2. Single book inside a folder with numeric name adopts folder name.
 * 3. Single book inside a folder with generic name ('book.pdf') adopts folder name.
 * 4. Folder with multiple books does NOT adopt folder name (each keeps its own name).
 * 5. Book directly in root folder keeps its own filename.
 * 6. Classification accurately scores based on the adopted folder name.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import fs from 'fs';
import path from 'path';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';

let app: Express;
let adminToken: string;

const testBaseDir = path.join(process.cwd(), 'LibraryData', 'test_bulk_folders');

beforeAll(async () => {
  app = await createExpressApp();

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });
  expect(adminLogin.status).toBe(200);
  adminToken = adminLogin.body.data.token;

  // Set up test directory structure
  if (fs.existsSync(testBaseDir)) {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testBaseDir, { recursive: true });

  // 1. Folder with author separator: "رياض الصالحين - الإمام النووي" with random hex file
  const folder1 = path.join(testBaseDir, 'رياض الصالحين - الإمام النووي');
  fs.mkdirSync(folder1, { recursive: true });
  fs.writeFileSync(path.join(folder1, 'a98f12cb49.pdf'), '%PDF-1.4\nTest Content\n%%EOF');

  // 2. Folder with title only: "صحيح البخاري" with numeric file
  const folder2 = path.join(testBaseDir, 'صحيح البخاري');
  fs.mkdirSync(folder2, { recursive: true });
  fs.writeFileSync(path.join(folder2, '104928.pdf'), '%PDF-1.4\nBukhari Content\n%%EOF');

  // 3. Folder with generic file: "كتاب التوحيد" with "book.pdf"
  const folder3 = path.join(testBaseDir, 'كتاب التوحيد');
  fs.mkdirSync(folder3, { recursive: true });
  fs.writeFileSync(path.join(folder3, 'book.pdf'), '%PDF-1.4\nTawheed Content\n%%EOF');

  // 4. Folder with multiple books: should NOT adopt folder name
  const multiFolder = path.join(testBaseDir, 'مجلد منوع');
  fs.mkdirSync(multiFolder, { recursive: true });
  fs.writeFileSync(path.join(multiFolder, 'تاريخ الأمم.pdf'), '%PDF-1.4\nHistory 1\n%%EOF');
  fs.writeFileSync(path.join(multiFolder, 'تاريخ الرسل.pdf'), '%PDF-1.4\nHistory 2\n%%EOF');

  // 5. File directly in root: should keep its own name
  fs.writeFileSync(path.join(testBaseDir, 'الألفية لابن مالك.pdf'), '%PDF-1.4\nAlfiyya\n%%EOF');
});

afterAll(() => {
  try {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  } catch {}
});

describe('Folder Name Extraction for Digital Books Bulk Scan', () => {
  it('1. Extracts title and author from folder name when file has random hex name', async () => {
    const res = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ folderPath: testBaseDir });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const items = res.body.data.items;
    const item1 = items.find((i: any) => i.originalFileName === 'a98f12cb49.pdf');
    expect(item1).toBeDefined();
    expect(item1.detectedFrom).toBe('folder');
    expect(item1.folderName).toBe('رياض الصالحين - الإمام النووي');
    expect(item1.title).toBe('رياض الصالحين');
    expect(item1.author).toBe('الإمام النووي');
    expect(item1.categoryId).toBe('cat-islamic');
  });

  it('2. Extracts title from folder name when file has numeric name (104928.pdf)', async () => {
    const res = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ folderPath: testBaseDir });

    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const item2 = items.find((i: any) => i.originalFileName === '104928.pdf');
    expect(item2).toBeDefined();
    expect(item2.detectedFrom).toBe('folder');
    expect(item2.title).toBe('صحيح البخاري');
    expect(item2.categoryId).toBe('cat-islamic');
  });

  it('3. Extracts title from folder name when file has generic name (book.pdf)', async () => {
    const res = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ folderPath: testBaseDir });

    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const item3 = items.find((i: any) => i.originalFileName === 'book.pdf');
    expect(item3).toBeDefined();
    expect(item3.detectedFrom).toBe('folder');
    expect(item3.title).toBe('كتاب التوحيد');
  });

  it('4. Does NOT adopt folder name when a folder contains multiple book files', async () => {
    const res = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ folderPath: testBaseDir });

    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const itemMulti1 = items.find((i: any) => i.originalFileName === 'تاريخ الأمم.pdf');
    const itemMulti2 = items.find((i: any) => i.originalFileName === 'تاريخ الرسل.pdf');

    expect(itemMulti1).toBeDefined();
    expect(itemMulti1.detectedFrom).toBe('file');
    expect(itemMulti1.title).toBe('تاريخ الأمم');

    expect(itemMulti2).toBeDefined();
    expect(itemMulti2.detectedFrom).toBe('file');
    expect(itemMulti2.title).toBe('تاريخ الرسل');
  });

  it('5. Files directly in root directory keep their own filenames', async () => {
    const res = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ folderPath: testBaseDir });

    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const itemRoot = items.find((i: any) => i.originalFileName === 'الألفية لابن مالك.pdf');

    expect(itemRoot).toBeDefined();
    expect(itemRoot.detectedFrom).toBe('file');
    expect(itemRoot.title).toBe('الألفية لابن مالك');
  });

  it('6. Imports folder-extracted book into database with clean title and author', async () => {
    await db.query("DELETE FROM books WHERE title = 'رياض الصالحين'");

    const scanRes = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ folderPath: testBaseDir });

    const item1 = scanRes.body.data.items.find((i: any) => i.folderName === 'رياض الصالحين - الإمام النووي');
    expect(item1).toBeDefined();

    // Clean any book with the same file hash
    if (item1.fileHash) {
      await db.query('DELETE FROM books WHERE file_hash = $1', [item1.fileHash]);
    }

    const importRes = await request(app)
      .post('/api/v1/books/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [item1] });

    expect(importRes.status).toBe(201);
    expect(importRes.body.success).toBe(true);
    expect(importRes.body.data.imported).toBe(1);

    const { rows: importedBook } = await db.query('SELECT * FROM books WHERE title = $1', ['رياض الصالحين']);
    expect(importedBook.length).toBe(1);
    expect(importedBook[0].author).toBe('الإمام النووي');
    expect(importedBook[0].category_id).toBe('cat-islamic');
    expect(fs.existsSync(importedBook[0].file_path)).toBe(true);

    // Clean up created record and file
    await db.query('DELETE FROM books WHERE id = $1', [importedBook[0].id]);
    try { fs.unlinkSync(importedBook[0].file_path); } catch {}
  });
});
