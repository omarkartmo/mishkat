import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import path from 'path';
import fs from 'fs';
import { createExpressApp } from '../server/index';
import { cleanAuthorName, extractAuthorFromText } from '../server/utils/authorExtractor';

let app: Express;
let adminToken: string;
const runId = Date.now();
const testDir = path.join(process.cwd(), 'scratch', `test-batch-scan-${runId}`);

beforeAll(async () => {
  app = await createExpressApp();

  const adminLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });

  expect(adminLoginRes.status).toBe(200);
  expect(adminLoginRes.body.success).toBe(true);
  adminToken = adminLoginRes.body.data.token;

  // Create temporary folder with 2 unique test books
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Book 1 inside a uniquely named folder
  const book1Dir = path.join(testDir, `كتاب أصول التفسير الفريد ${runId}`);
  fs.mkdirSync(book1Dir, { recursive: true });
  fs.writeFileSync(path.join(book1Dir, 'unique_book_1.pdf'), `%PDF-1.4 Mock PDF Content 1 - ${runId}`);

  // Book 2 directly in test folder
  fs.writeFileSync(path.join(testDir, `مختصر المسائل الفقهية الفريد ${runId}.pdf`), `%PDF-1.4 Mock PDF Content 2 - ${runId}`);
});

afterAll(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe('Author Extraction & Text Normalization Unit Tests', () => {
  it('should clean author names and strip unwanted editorial tokens', () => {
    const raw1 = 'تأليف: الشيخ الدكتور أحمد بن محمد تحقيق ودراسة فلان';
    const cleaned1 = cleanAuthorName(raw1);
    expect(cleaned1).toBe('الشيخ الدكتور أحمد بن محمد');

    const raw2 = 'بقلم الأستاذ عبد الرحمن طبعة دار الفكر';
    const cleaned2 = cleanAuthorName(raw2);
    expect(cleaned2).toBe('الأستاذ عبد الرحمن');
  });

  it('should extract author from reverse title page layout ("Author : تأليف")', () => {
    const pageText = 'بسم الله الرحمن الرحيم كتاب الصوم الشيخ علي يحيى معمر : تأليف طبعة أولى';
    const author = extractAuthorFromText(pageText);
    expect(author).toBe('الشيخ علي يحيى معمر');
  });

  it('should extract author from forward pattern ("تأليف : Author")', () => {
    const pageText = 'العقيدة الإسلامية تأليف: العلامة ابن باديس الجزائري دار النشر 1980';
    const author = extractAuthorFromText(pageText);
    expect(author).toBe('العلامة ابن باديس الجزائري');
  });

  it('should extract author from honorific pattern ("للإمام / للشيخ")', () => {
    const pageText = 'متن الرسالة للإمام ابن أبي زيد القيرواني رحمه الله';
    const author = extractAuthorFromText(pageText);
    expect(author).toBe('ابن أبي زيد القيرواني');
  });

  it('should normalize Arabic Unicode presentation forms (NFKC)', () => {
    // Unicode presentation forms: ﺗﺄﻟﻴﻒ (presentation form) vs standard تأليف
    // \uFE97 (Teh) \uFE83 (Alef Hamza) \uFEDF (Lam) \uFEF4 (Yeh medial) \uFEBB (Feh final)
    const presentationText = '\uFE97\uFE83\uFEDF\uFEF4\uFEBB : \u0627\u0644\u062F\u0643\u062A\u0648\u0631 \u0645\u062D\u0645\u062F \u0627\u0644\u0637\u0627\u0647\u0631';
    const author = extractAuthorFromText(presentationText);
    expect(author).not.toBeNull();
    expect(author).toContain('محمد');
  });
});

describe('Progressive Batch Import & Exclusion API Tests', () => {
  it('should scan test directory with batch limit of 1 and show remaining count', async () => {
    const scanRes = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        folderPath: testDir,
        limit: 1,
        offset: 0,
        excludeImported: true,
      });

    expect(scanRes.status).toBe(200);
    expect(scanRes.body.success).toBe(true);
    const data = scanRes.body.data;

    expect(data.totalDiscoveredInFolder).toBe(2);
    expect(data.batchSize).toBe(1);
    expect(data.items.length).toBe(1);
    expect(data.hasMore).toBe(true);
    expect(data.remainingCount).toBe(1);
  });

  it('should import the first book, and exclude it on the subsequent scan', async () => {
    // Scan batch 1
    const scanRes1 = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        folderPath: testDir,
        limit: 1,
        excludeImported: true,
      });

    expect(scanRes1.body.success).toBe(true);
    const firstItem = scanRes1.body.data.items[0];
    expect(firstItem).toBeDefined();

    // Import this item
    const importRes = await request(app)
      .post('/api/v1/books/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [firstItem],
      });

    expect([200, 201]).toContain(importRes.status);
    expect(importRes.body.success).toBe(true);
    expect(importRes.body.data.imported).toBe(1);

    // Now scan again with excludeImported: true
    const scanRes2 = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        folderPath: testDir,
        limit: 25,
        excludeImported: true,
      });

    expect(scanRes2.body.success).toBe(true);
    const data2 = scanRes2.body.data;

    // The already imported book is excluded!
    expect(data2.alreadyImportedCount).toBe(1);
    expect(data2.pendingCount).toBe(1);
    expect(data2.items.length).toBe(1);
    expect(data2.items[0].fileHash).not.toBe(firstItem.fileHash);

    // If excludeImported is false, both files are returned and one is flagged duplicate
    const scanResAll = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        folderPath: testDir,
        limit: 25,
        excludeImported: false,
      });

    expect(scanResAll.body.success).toBe(true);
    expect(scanResAll.body.data.items.length).toBe(2);
    const dupItem = scanResAll.body.data.items.find((i: any) => i.fileHash === firstItem.fileHash);
    expect(dupItem.isDuplicate).toBe(true);
  });
});
