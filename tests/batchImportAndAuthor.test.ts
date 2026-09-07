import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import path from 'path';
import fs from 'fs';
import { createExpressApp } from '../server/index';
import {
  cleanAuthorName,
  extractAuthorFromText,
  extractAuthorFromLines,
  extractTitleFromPageText,
  extractIntroductionExcerpt,
  extractDocumentMetadata,
} from '../server/utils/authorExtractor';

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

  it('should extract author across lines when "تأليف" is on a separate line', () => {
    const lines = [
      'وزارة التراث القومي والثقافة',
      'كتاب الضياء',
      'تأليف',
      'العلامة سلمة بن مسلم العوتبي',
      'مطابع عمان',
    ];
    const author = extractAuthorFromLines(lines);
    expect(author).toBe('العلامة سلمة بن مسلم العوتبي');
  });

  it('should verify / extract authentic book title from page text', () => {
    const page1 = 'بسم الله الرحمن الرحيم كتاب المصنف في الفقه والأحكام تأليف فلان';
    const title1 = extractTitleFromPageText(page1);
    expect(title1).toContain('كتاب المصنف');

    const page2 = 'ديوان أبي مسلم البهلاني الرواحي حسان عمان';
    const title2 = extractTitleFromPageText(page2);
    expect(title2).toContain('ديوان أبي مسلم');
  });

  it('should extract introductory excerpt for domain classification and description', () => {
    const fullText = 'بسم الله الرحمن الرحيم المقدمة الحمد لله رب العالمين والصلاة والسلام على رسوله، أما بعد فهذا كتاب في أصول الفقه الإسلامي ومسائل الاجتهاد والتقليد';
    const { introExcerpt, introFull } = extractIntroductionExcerpt(fullText);
    expect(introExcerpt).not.toBeNull();
    expect(introExcerpt).toContain('مقدمة الكتاب');
    expect(introFull).toContain('أصول الفقه');
  });

  it('should normalize Arabic Unicode presentation forms (NFKC)', () => {
    const presentationText = '\uFE97\uFE83\uFEDF\uFEF4\uFEBB : \u0627\u0644\u062F\u0643\u062A\u0648\u0631 \u0645\u062D\u0645\u062F \u0627\u0644\u0637\u0627\u0647\u0631';
    const author = extractAuthorFromText(presentationText);
    expect(author).not.toBeNull();
    expect(author).toContain('محمد');
  });

  it('should extract author "د. محمد بن صالح ناصر" when title is "أبو مسلم الرواحي (حسان عمان)" and not confuse title with author', () => {
    const lines = [
      'أبو مسلم الرواحي',
      '«حسان عمان»',
      'ت: (1920م)',
      'تأليف',
      'د/ محمد بن صالح ناصر',
    ];
    const author = extractAuthorFromLines(lines);
    expect(author).toContain('محمد بن صالح ناصر');
    expect(author).not.toContain('أبو مسلم');
  });

  it('should extract author "محمد بن يوسف إطفيش" from "تصنيف: العلامة محمد بن يوسف إطفيش" and NEVER return Baruni', () => {
    const lines = [
      'سلطنة عمان',
      'وزارة التراث القومي والثقافة',
      'كتاب الجامع الصغير',
      'تصنيف',
      'العلامة محمد بن يوسف إطفيش',
      'الجزء الأول',
    ];
    const author = extractAuthorFromLines(lines);
    expect(author).toContain('محمد بن يوسف إطفيش');
    expect(author).not.toContain('الباروني');
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

  it('should scan real books folder and NEVER assign fake publisher names like "المكتبة السعيدية"', async () => {
    const userBooksDir = 'C:\\Users\\NABTAKIR\\Downloads\\كتب';
    if (!fs.existsSync(userBooksDir)) return;

    const res = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        folderPath: userBooksDir,
        limit: 25,
        excludeImported: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const items = res.body.data.items;

    // Verify: NOT A SINGLE BOOK has author "المكتبة السعيدية" or publisher names
    for (const item of items) {
      expect(item.author).not.toContain('المكتبة السعيدية');
      expect(item.author).not.toContain('المكتبة');
      expect(item.author).not.toContain('وزارة');
    }

    // Verify books extract actual author without fake publishers or forced catalog names
    const alWadBook = items.find((i: any) => i.title.includes('كتاب الوضع'));
    if (alWadBook) {
      expect(alWadBook.author).toBeTruthy();
      expect(alWadBook.author).not.toContain('المكتبة');
      expect(alWadBook.author).not.toContain('وزارة');
    }

    const manhajBook = items.find((i: any) => i.title.includes('منهج الطالبين'));
    if (manhajBook) {
      expect(manhajBook.author).toBeTruthy();
      expect(manhajBook.author).not.toContain('المكتبة');
    }

    const ibnSalamBook = items.find((i: any) => i.title.includes('ابن سلام'));
    if (ibnSalamBook) {
      expect(typeof ibnSalamBook.author).toBe('string');
      expect(ibnSalamBook.author).not.toContain('المكتبة');
    }

    // Specific test for user's real books in C:\Users\NABTAKIR\Downloads\كتب
    const abuMuslimBook = items.find((i: any) => (i.originalFileName && i.originalFileName.includes('1000323')) || i.title.includes('أبو مسلم'));
    if (abuMuslimBook) {
      expect(abuMuslimBook.author).toBe('د. محمد بن صالح ناصر');
      expect(abuMuslimBook.categoryId).toBe('cat-arabic');
    }

    const jamiSaghirBook = items.find((i: any) => (i.originalFileName && i.originalFileName.includes('1000746')) || i.title.includes('الجامع الصغير'));
    if (jamiSaghirBook) {
      expect(jamiSaghirBook.author).toBe('العلامة محمد بن يوسف إطفيش');
      expect(jamiSaghirBook.author).not.toContain('الباروني');
      expect(jamiSaghirBook.categoryId).toBe('cat-islamic');
    }
  });

  it('should leave author empty ("") when no authentic author is found across pages 1-4', async () => {
    // Test book 2 has no author pattern in filename or mock content
    const res = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        folderPath: testDir,
        limit: 10,
        excludeImported: false,
      });

    expect(res.status).toBe(200);
    const items = res.body.data.items;
    const anonymousBook = items.find((i: any) => i.title.includes('مختصر المسائل الفقهية الفريد'));
    expect(anonymousBook).toBeDefined();
    // Author should be strictly empty string ("") without fabricating an unrelated author
    expect(anonymousBook.author).toBe('');
    // But category should be accurately classified as Sharia because of the title
    expect(anonymousBook.categoryId).toBe('cat-islamic');
  });

  it('should strictly reject OCR gibberish and reversed non-author tokens', () => {
    expect(cleanAuthorName('د. هللاو قفوملا')).toBeNull();
    expect(cleanAuthorName('مين')).toBeNull();
    expect(cleanAuthorName('عمينبتيميربعلنسعرر')).toBeNull();
    expect(cleanAuthorName('عمى تمير على سعر')).toBeNull();
    expect(cleanAuthorName('ممين تم على سمر')).toBeNull();
  });

  it('should classify "منهج الطالبين وبلاغ الراغبين" as Islamic Sciences across all parts', async () => {
    const userBooksDir = 'C:\\Users\\NABTAKIR\\Downloads\\كتب';
    if (!fs.existsSync(userBooksDir)) return;

    const res = await request(app)
      .post('/api/v1/books/bulk-scan')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        folderPath: userBooksDir,
        limit: 25,
        excludeImported: false,
      });

    expect(res.status).toBe(200);
    const items = res.body.data.items;

    // Filter all parts of "منهج الطالبين وبلاغ الراغبين"
    const manhajParts = items.filter((i: any) => i.title.includes('منهج الطالبين'));
    if (manhajParts.length > 0) {
      for (const part of manhajParts) {
        // Every single part MUST have author "خميس بن سعيد الشقصي الرستاقي"
        expect(part.author).toBe('خميس بن سعيد الشقصي الرستاقي');
        // Category must be Islamic Sciences (cat-islamic) NOT education
        expect(part.categoryId).toBe('cat-islamic');
        // Must NEVER contain any OCR gibberish
        expect(part.author).not.toContain('هللاو');
        expect(part.author).not.toContain('مين');
        expect(part.author).not.toContain('عمينبتيمير');
      }
    }
  });
});
