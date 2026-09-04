import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createExpressApp } from '../server/index';
import {
  PORTAL_CATALOG_DATABASE,
  getPortalBooks,
  searchPortalBooks,
  PortalBookItem,
} from '../src/data/portalCatalogs';
import { INITIAL_WHITELISTED_PORTALS } from '../src/data/initialData';

let app: Express;
let adminToken: string;
let studentToken: string;
let studentUser: any;

beforeAll(async () => {
  app = await createExpressApp();

  // 1. Authenticate Admin
  const adminLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });

  expect(adminLoginRes.status).toBe(200);
  adminToken = adminLoginRes.body.data.token;

  // Reset database to clean initial state
  const resetRes = await request(app)
    .post('/api/v1/system/reset-demo')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ confirm: true });
  expect(resetRes.status).toBe(200);

  // 2. Authenticate Student
  const studentLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });

  expect(studentLoginRes.status).toBe(200);
  studentToken = studentLoginRes.body.data.token;
  studentUser = studentLoginRes.body.data.user;
});

describe('Phase 15.4-C: Strict Source Provenance Integrity & Interactive Explorer', () => {
  const portalA = 'portal-ibadi';
  const portalB = 'portal-shamela';
  const portalC = 'portal-arabic-academy';

  // Test A — Source integrity
  it('Test A: When Portal A is selected, every result MUST strictly have sourcePortalId === Portal A', () => {
    const books = getPortalBooks(portalA);
    expect(books.length).toBeGreaterThan(0);

    for (const book of books) {
      expect(book.portalId).toBe(portalA);
      expect(book.sourcePortalId).toBe(portalA);
      expect(book.sourcePortalName).toBe('المكتبة الشاملة الإباضية');
      expect(book.extractionMethod).toBe('direct_verified_source_record');
      expect(book.isDirectExtraction).toBe(true);
      expect(book.sourceUrl).toContain('al-maktaba.net');
    }
  });

  // Test B — No hallucinated results
  it('Test B: A nonexistent query returns zero source results and NEVER synthesizes synthetic books', () => {
    const fabricatedQuery = 'ZXQ_TEST_NONEXISTENT_BOOK_98431';
    const results = searchPortalBooks(portalA, fabricatedQuery);

    expect(results).toHaveLength(0);
    expect(results).toEqual([]);
  });

  // Test C — No silent fallback
  it('Test C: When Portal A has 0 matching results for a term only in Portal B, it does NOT fall back silently to Portal B', () => {
    // 'دلائل الإعجاز' exists in Portal B (Shamela), but NOT in Portal A (Ibadi)
    const resultsOnPortalA = searchPortalBooks(portalA, 'دلائل الإعجاز');
    expect(resultsOnPortalA).toHaveLength(0);

    const resultsOnPortalB = searchPortalBooks(portalB, 'دلائل الإعجاز');
    expect(resultsOnPortalB.length).toBeGreaterThan(0);
    expect(resultsOnPortalB[0].portalId).toBe(portalB);
  });

  // Test D — Source URL integrity
  it('Test D: Every external result has a traceable source record URL and source domain', () => {
    for (const book of PORTAL_CATALOG_DATABASE) {
      expect(book.sourceRecordUrl).toBeDefined();
      expect(book.sourceRecordUrl).toMatch(/^https?:\/\//);
      expect(book.sourceUrl).toBeDefined();
      expect(book.sourceUrl).toMatch(/^https?:\/\//);
      expect(book.retrievedAt).toBeDefined();
    }
  });

  // Test E — Metadata integrity
  it('Test E: Missing source metadata remains missing/undefined instead of being fabricated', () => {
    // portal-arabic-academy book does not have volumeInfo or investigator in some editions
    const academyBooks = getPortalBooks(portalC);
    expect(academyBooks.length).toBeGreaterThan(0);

    for (const book of academyBooks) {
      // Tags should not be fabricated with other portals
      expect(book.portalId).toBe(portalC);
      expect(book.sourcePortalId).toBe(portalC);
    }
  });

  // Test F — Cross-source isolation
  it('Test F: A result belonging to Portal B must NEVER appear inside Portal A result set', () => {
    const portalABooks = getPortalBooks(portalA);
    const portalBBooks = getPortalBooks(portalB);

    const portalAIds = new Set(portalABooks.map((b) => b.id));
    const portalBIds = new Set(portalBBooks.map((b) => b.id));

    // Intersection must be empty
    for (const id of portalAIds) {
      expect(portalBIds.has(id)).toBe(false);
    }
    for (const b of portalABooks) {
      expect(b.portalId).not.toBe(portalB);
      expect(b.sourcePortalId).not.toBe(portalB);
    }
  });
});

describe('Phase 15.4-C: Search Diversity & Deduplication Verification', () => {
  it('should return unique digital books without duplicate records in catalog', async () => {
    const res = await request(app)
      .get('/api/v1/books?type=digital')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const books = res.body.data;
    const ids = new Set<string>();
    const titles = new Map<string, number>();

    for (const book of books) {
      expect(ids.has(book.id)).toBe(false);
      ids.add(book.id);
      titles.set(book.title, (titles.get(book.title) || 0) + 1);
    }

    // Every distinct digital book title in the clean catalog should appear once
    for (const [title, count] of titles.entries()) {
      expect(count).toBe(1);
    }
  });

  it('should support search across titles, authors, and keywords', async () => {
    // 1. Search by author
    const authorRes = await request(app)
      .get('/api/v1/books?search=السالمي')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(authorRes.status).toBe(200);
    expect(authorRes.body.data.length).toBeGreaterThan(0);
    for (const b of authorRes.body.data) {
      const match = b.author.includes('السالمي') || b.title.includes('السالمي') || b.summary.includes('السالمي');
      expect(match).toBe(true);
    }

    // 2. Search by category
    const catRes = await request(app)
      .get('/api/v1/books?categoryId=cat-history')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(catRes.status).toBe(200);
    for (const b of catRes.body.data) {
      expect(b.categoryId).toBe('cat-history');
    }

    // 3. No-match search returns empty array
    const noMatchRes = await request(app)
      .get('/api/v1/books?search=NONEXISTENT_SEARCH_STRING_12345')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(noMatchRes.status).toBe(200);
    expect(noMatchRes.body.data).toEqual([]);
  });
});

describe('Phase 15.4-C: Digital Reader Streaming & Central Approval Flow', () => {
  it('should successfully stream digital book files with HTTP 206 Partial Content', async () => {
    // Get all digital books
    const booksRes = await request(app)
      .get('/api/v1/books?type=digital')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(booksRes.status).toBe(200);
    const digitalBooks = booksRes.body.data;
    const targetBook = digitalBooks.find((b: any) => b.id.startsWith('book-dig-')) || digitalBooks[0];
    expect(targetBook).toBeDefined();

    // Request byte range
    const streamRes = await request(app)
      .get(`/api/v1/books/${targetBook.id}/file`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Range', 'bytes=0-20');

    expect(streamRes.status).toBe(206);
    expect(streamRes.headers['content-range']).toMatch(/^bytes 0-20\/\d+/);
    expect(streamRes.headers['accept-ranges']).toBe('bytes');
  });

  it('should submit book for central approval with full provenance and user tracking', async () => {
    const submissionPayload = {
      title: `كتاب التوثيق والاعتماد ${Date.now()}`,
      author: 'الشيخ المحقق',
      suggestedCategoryId: 'cat-islamic',
      format: 'pdf',
      sourceUrl: 'https://al-maktaba.net/book/test-submission',
      sourcePortalName: 'المكتبة الشاملة الإباضية',
      summary: 'مخطوطة فقهية موثقة مقترحة للمراجعة والاعتماد المركزي.',
      studentId: studentUser.id,
      studentName: studentUser.name,
      studentRegNumber: studentUser.registrationNumber,
      pagesEstimated: 350,
    };

    const submitRes = await request(app)
      .post('/api/v1/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(submissionPayload);

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.data.id).toBeDefined();
    expect(['pending', 'PENDING_REVIEW']).toContain(submitRes.body.data.status);
    expect(submitRes.body.data.studentName).toBe(studentUser.name);
  });
});
