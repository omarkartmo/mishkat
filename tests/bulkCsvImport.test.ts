import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createExpressApp } from '../server/index';

let app: Express;
let adminToken: string;
let studentToken: string;
const runId = Date.now();

beforeAll(async () => {
  app = await createExpressApp();

  const adminLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });
  expect(adminLoginRes.status).toBe(200);
  expect(adminLoginRes.body.success).toBe(true);
  adminToken = adminLoginRes.body.data.token;

  const studentLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });
  expect(studentLoginRes.status).toBe(200);
  expect(studentLoginRes.body.success).toBe(true);
  studentToken = studentLoginRes.body.data.token;
});

describe('Bulk Physical Books CSV Import API (POST /api/v1/books/bulk-physical)', () => {
  it('should deny unauthorized requests without token', async () => {
    const res = await request(app)
      .post('/api/v1/books/bulk-physical')
      .send({ items: [] });
    expect(res.status).toBe(401);
  });

  it('should deny requests from student role', async () => {
    const res = await request(app)
      .post('/api/v1/books/bulk-physical')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        items: [{ title: `كتاب تجريبي ${runId}`, author: 'مؤلف تجريبي' }],
      });
    expect(res.status).toBe(403);
  });

  it('should return 400 when items array is missing or empty', async () => {
    const res = await request(app)
      .post('/api/v1/books/bulk-physical')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should successfully import multiple physical books and create copies and categories', async () => {
    const testItems = [
      {
        title: `كتاب الفقه المقارن المجمع ${runId}`,
        author: 'الشيخ محمد بن عبد الله',
        categoryName: 'علوم شرعية', // should match category 'العلوم الشرعية'
        publisher: 'دار النور والتراث',
        publishYear: 2021,
        isbn: `978-999${runId.toString().slice(-6)}`,
        totalCopies: 4,
        location: {
          cabinet: 'A-04',
          shelf: '3',
          section: 'الفقه الإسلامي',
        },
        pages: 350,
        summary: 'كتاب منهجي جامع في مسائل الفقه المقارن وأدلته.',
      },
      {
        title: `كتاب البيان في اللغة والأدب ${runId}`,
        author: 'د. سعيد المرزوقي',
        categoryName: 'اللغة العربية والآداب',
        publisher: 'دار الفكر العربي',
        publishYear: 2019,
        isbn: `978-888${runId.toString().slice(-6)}`,
        totalCopies: 2,
        location: {
          cabinet: 'B-02',
          shelf: '1',
          section: 'اللغة والأدب',
        },
        pages: 280,
      },
    ];

    const res = await request(app)
      .post('/api/v1/books/bulk-physical')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: testItems });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(2);
    expect(Array.isArray(res.body.data.books)).toBe(true);
    expect(res.body.data.books.length).toBe(2);

    const imported1 = res.body.data.books[0];
    expect(imported1.title).toBe(testItems[0].title);
    expect(imported1.author).toBe(testItems[0].author);
    expect(imported1.type).toBe('physical');
    expect(imported1.totalCopies).toBe(4);
    expect(imported1.availableCopies).toBe(4);
    expect(imported1.location.cabinet).toBe('A-04');
    expect(imported1.location.shelf).toBe('3');

    // Verify it is queryable from central library books endpoint
    const getRes = await request(app)
      .get('/api/v1/books')
      .query({ search: `كتاب الفقه المقارن المجمع ${runId}` });

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    const found = getRes.body.data.find((b: any) => b.id === imported1.id);
    expect(found).toBeDefined();
    expect(found.totalCopies).toBe(4);
    expect(found.location.cabinet).toBe('A-04');
  });

  it('should skip rows with missing titles but import valid rows', async () => {
    const mixedItems = [
      {
        title: '', // Invalid row
        author: 'مجهول',
      },
      {
        title: `كتاب الرياضيات المتقدمة ${runId}`,
        author: 'د. فاروق حسان',
        totalCopies: 1,
      },
    ];

    const res = await request(app)
      .post('/api/v1/books/bulk-physical')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: mixedItems });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(1);
    expect(res.body.data.books[0].title).toBe(mixedItems[1].title);
  });
});
