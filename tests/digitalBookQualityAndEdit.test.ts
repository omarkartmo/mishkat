import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';
import { healCorruptedDigitalBooks } from '../server/services/bookSanitizer';
import {
  isValidArabicSentence,
  synthesizeBookSummary,
  extractDocumentMetadata,
} from '../server/utils/authorExtractor';

let app: Express;
let adminToken: string;

beforeAll(async () => {
  app = await createExpressApp();

  const adminLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });

  expect(adminLoginRes.status).toBe(200);
  expect(adminLoginRes.body.success).toBe(true);
  adminToken = adminLoginRes.body.data.token;
});

describe('Digital Book Quality & Summary Validation', () => {
  it('should reject cipher / gibberish text and only validate authentic Arabic prose', () => {
    // Gibberish / cipher examples like reported by user
    const cipherNoise = 'ab12#$ 9987 &*^& 010101010101 4453535';
    const brokenAscii = '  1234857 dghjks dfhjsdfk';
    const lowArabic = 'كتاب 1234567890 ABCD EFGH IJKL MNOP QRST';

    expect(isValidArabicSentence(cipherNoise)).toBe(false);
    expect(isValidArabicSentence(brokenAscii)).toBe(false);
    expect(isValidArabicSentence(lowArabic)).toBe(false);

    // Reversed Arabic words and OCR hallucinations (user-reported absurd cases)
    const reversedWordsSample = 'ةرازؤ ثازنلا وقلا ةفاقثلاو ةنطلس ناكم ةداعسلا';
    const singleLetterNoise = '١ 2 ت ت 0 4 P$ ےک Ec روک O ج د ر ز س ش';
    const reversedArticle = 'باتكلا مظعأو هيلع دومحملا لله دمحلا';

    expect(isValidArabicSentence(reversedWordsSample)).toBe(false);
    expect(isValidArabicSentence(singleLetterNoise)).toBe(false);
    expect(isValidArabicSentence('ةرازو ملعتلا يلاعلا')).toBe(false); // starting with 'ة'

    // Authentic Arabic sentences
    const authenticProse1 = 'الحمد لله رب العالمين وصلى الله وسلم على نبينا محمد وعلى آله وصحبه أجمعين، وبعد فهذا كتاب جامع ومختصر في الفقه وأصوله.';
    const authenticProse2 = 'يتناول هذا المرجع الهام تاريخ وحضارة أهل عمان وسير أئمتهم وعلمائهم عبر العصور.';

    expect(isValidArabicSentence(authenticProse1)).toBe(true);
    expect(isValidArabicSentence(authenticProse2)).toBe(true);
  });

  it('should synthesize rich, academic book summaries for different knowledge domains', () => {
    const fiqhSummary = synthesizeBookSummary('الجامع الصغير', 'محمد بن يوسف أطفيش', 'الفقه الإسلامي وأصوله');
    expect(fiqhSummary).toContain('الجامع الصغير');
    expect(fiqhSummary).toContain('محمد بن يوسف أطفيش');
    expect(fiqhSummary).toContain('والفقه الإسلامي');
    expect(isValidArabicSentence(fiqhSummary)).toBe(true);

    const historySummary = synthesizeBookSummary('تحفة الأعيان بسيرة أهل عمان', 'عبد الله بن حميد السالمي', 'التاريخ والتراجم');
    expect(historySummary).toContain('تحفة الأعيان بسيرة أهل عمان');
    expect(historySummary).toContain('عبد الله بن حميد السالمي');
    expect(historySummary).toContain('تاريخي وتوثيقي');
    expect(isValidArabicSentence(historySummary)).toBe(true);

    const litSummary = synthesizeBookSummary('ديوان أبي مسلم البهلاني', 'أبو مسلم ناصر بن سالم الرواحي', 'اللغة العربية والآداب');
    expect(litSummary).toContain('ديوان أبي مسلم البهلاني');
    expect(isValidArabicSentence(litSummary)).toBe(true);
  });

  it('should create, accurately edit, and delete a digital book via API', async () => {
    // 1. Create digital book with specific page count and summary
    const createRes = await request(app)
      .post('/api/v1/books')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'digital',
        title: 'كتاب القواعد الفقهية الكبرى التوثيقي',
        author: 'العلامة نور الدين السالمي',
        format: 'pdf',
        pagesCount: 384,
        sourceOrigin: 'مستودع المخطوطات والنوادر',
        summary: 'دراسة وتحقيق معتمد في القواعد والمسائل الفقهية الشاملة.',
        tags: ['فقه', 'قواعد', 'تراث'],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const createdBook = createRes.body.data;
    const bookId = createdBook.id;
    expect(Number(createdBook.pagesCount)).toBe(384);
    expect(createdBook.summary).toBe('دراسة وتحقيق معتمد في القواعد والمسائل الفقهية الشاملة.');

    // 2. Update digital book metadata (Edit)
    const updateRes = await request(app)
      .put(`/api/v1/books/${bookId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'digital',
        title: 'كتاب القواعد الفقهية الكبرى (طبعة محققة ومصححة)',
        author: 'الشيخ الإمام نور الدين السالمي',
        pagesCount: 420,
        summary: 'طبعة محققة حديثاً تشتمل على تخريج الفروع والأصول وتدقيق كامل.',
        tags: ['فقه', 'قواعد_فقهية', 'أصول'],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);

    // Verify updated book in database
    const verifyUpdatedRes = await request(app)
      .get(`/api/v1/books/${bookId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(verifyUpdatedRes.status).toBe(200);
    expect(verifyUpdatedRes.body.data.title).toBe('كتاب القواعد الفقهية الكبرى (طبعة محققة ومصححة)');
    expect(verifyUpdatedRes.body.data.author).toBe('الشيخ الإمام نور الدين السالمي');
    expect(Number(verifyUpdatedRes.body.data.pages_count)).toBe(420);
    expect(verifyUpdatedRes.body.data.summary).toBe('طبعة محققة حديثاً تشتمل على تخريج الفروع والأصول وتدقيق كامل.');

    // 3. Delete digital book
    const deleteRes = await request(app)
      .delete(`/api/v1/books/${bookId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // 4. Verify it is removed
    const getRes = await request(app).get(`/api/v1/books/${bookId}`);
    expect(getRes.status).toBe(404);
  });

  it('should automatically heal corrupted / reversed book summaries in database', async () => {
    // Insert a book with corrupted/reversed summary
    const testBookId = `test-corrupt-${Date.now()}`;
    await db.query(`
      INSERT INTO books (id, title, author, type, format, summary, created_at, updated_at)
      VALUES ($1, $2, $3, 'digital', 'pdf', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      testBookId,
      'رياض الصالحين من كلام سيد المرسلين',
      'الإمام يحيى بن شرف النووي',
      'ةرازؤ ثازنلا وقلا ةفاقثلاو ةنطلس ناكم ةداعسلا', // Corrupted reversed text
    ]);

    // Run self-healing routine
    const healedCount = await healCorruptedDigitalBooks(db);
    expect(healedCount).toBeGreaterThanOrEqual(1);

    // Verify summary was sanitized and synthesized cleanly
    const { rows } = await db.query('SELECT summary FROM books WHERE id = $1', [testBookId]);
    expect(rows.length).toBe(1);
    const healedSummary = rows[0].summary;
    expect(isValidArabicSentence(healedSummary)).toBe(true);
    expect(healedSummary).not.toContain('ةرازؤ');
    expect(healedSummary).toContain('رياض الصالحين');

    // Clean up
    await db.query('DELETE FROM books WHERE id = $1', [testBookId]);
  });
});
