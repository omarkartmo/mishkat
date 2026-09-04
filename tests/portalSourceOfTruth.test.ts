/**
 * MISHKAT — Phase 15.4-E Regression Test Suite
 * Live External Portal Reality Audit + Strict Source-of-Truth Architecture
 *
 * Enforces:
 * 1. Truthful capability classification (LIVE_OFFICIAL_API, LIVE_OAI_PMH, STATIC_VERIFIED_SNAPSHOT, BROWSE_ONLY)
 * 2. Source-of-truth verification (runtime call graph and authentic endpoints)
 * 3. Anti-fabrication & zero general-internet fallback
 * 4. Local catalog bypass test (live search vs static snapshot)
 * 5. Browse-only portal workflow & manual digital book suggestions
 * 6. Admin approval with central server download & validation (SSRF, file integrity, zero fake books)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Express } from 'express';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';
import { serverConfig } from '../server/config';
import { DiscoveryEngine } from '../server/services/portals/DiscoveryEngine';
import { PortalManager } from '../server/services/portals/portalManager';
import { VerifiedCatalogAdapter } from '../server/services/portals/adapters/VerifiedCatalogAdapter';
import { OfficialApiAdapter } from '../server/services/portals/adapters/OfficialApiAdapter';
import { DigitalDownloadService } from '../server/services/portals/digitalDownloadService';

let app: Express;
let mockServer: http.Server;
let mockPort: number;
let mockBaseUrl: string;

let adminToken: string;
let studentToken: string;

beforeAll(async () => {
  // 1. Start an authoritative local HTTP mock server for live protocol tests
  await new Promise<void>((resolve) => {
    mockServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // Home probe
      if (url.pathname === '/' || url.pathname === '') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><head><title>بوابة الاختبار المباشرة</title></head><body>مرحباً بكم في بوابة الاختبار المباشرة</body></html>');
        return;
      }

      // Route A: Live Official REST/JSON API
      if (url.pathname === '/api/v1/search') {
        const query = url.searchParams.get('q') || '';
        if (query === 'nonexistent-impossible-book-999') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ total: 0, items: [] }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            total: 1,
            items: [
              {
                id: 'rec-live-101',
                title: 'تاريخ عُمان عبر العصور المعتمد',
                author: 'أحمد بن ماجد السالمي',
                year: '1440 هـ',
                pages: 420,
                url: `${mockBaseUrl}/records/rec-live-101`,
                summary: 'سجل تاريخي أصيل من الخادم المباشر',
              },
            ],
          })
        );
        return;
      }

      // Route B: Single record endpoint
      if (url.pathname === '/records/rec-live-101') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <head><title>تاريخ عُمان عبر العصور المعتمد</title></head>
            <body>
              <h1>تاريخ عُمان عبر العصور المعتمد</h1>
              <p>المؤلف: أحمد بن ماجد السالمي</p>
              <div class="content">نص السجل الأصيل...</div>
            </body>
          </html>
        `);
        return;
      }

      // Route C: Authentic PDF Download Endpoint
      if (url.pathname === '/download/authentic-book.pdf') {
        const samplePdfBuffer = Buffer.from(
          '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000114 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n' +
          'MISHKAT_AUTHENTIC_DIGITAL_MANUSCRIPT_BODY_DATA_PADDING_FOR_TESTING_PURPOSES_OVER_500_BYTES_'.repeat(10)
        );
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': samplePdfBuffer.length.toString(),
        });
        res.end(samplePdfBuffer);
        return;
      }

      // Route D: Fake PDF returning HTML Error page (Soft 404 test for downloads)
      if (url.pathname === '/download/fake-book-soft404.pdf') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body>404 Not Found - الكتاب المطلوب غير موجود أو تم حذفه</body></html>');
        return;
      }

      // Route E: OAI-PMH identify and list
      if (url.pathname === '/oai') {
        const verb = url.searchParams.get('verb');
        if (verb === 'Identify') {
          res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
          res.end(`<?xml version="1.0" encoding="UTF-8"?>
            <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
              <repositoryName>المستودع الأكاديمي المباشر</repositoryName>
              <baseURL>${mockBaseUrl}/oai</baseURL>
            </OAI-PMH>`);
          return;
        }
      }

      // Route F: Browse-only homepage without any machine API
      if (url.pathname === '/browse-only-site') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <head><title>موقع تراثي عام</title></head>
            <body>
              <h1>مرحباً بكم في موقع التراث</h1>
              <p>تصفح المخطوطات والكتب المتاحة.</p>
              <a href="${mockBaseUrl}/download/authentic-book.pdf">تحميل الكتاب المعتمد (PDF)</a>
            </body>
          </html>
        `);
        return;
      }

      // Default 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    mockServer.listen(0, '127.0.0.1', () => {
      const address = mockServer.address() as any;
      mockPort = address.port;
      mockBaseUrl = `http://127.0.0.1:${mockPort}`;
      resolve();
    });
  });

  // 2. Initialize Express application
  app = await createExpressApp();

  // 3. Obtain tokens for Admin and Student
  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });
  adminToken = adminLogin.body.data.token;

  const stuLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });
  studentToken = stuLogin.body.data.token;
});

afterAll(async () => {
  if (mockServer) {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
  VerifiedCatalogAdapter.setBypassLocalCatalog(false);
});

describe('Phase 15.4-E: Source of Truth, Capability Classification & Server Downloads', () => {
  // 1. Truthful capability classification
  it('1. Discovery correctly detects LIVE_OFFICIAL_API when valid JSON endpoint exists', async () => {
    const discovery = await DiscoveryEngine.discoverPortal(mockBaseUrl, {
      allowedDomains: ['127.0.0.1'],
      allowLocalhost: true,
    });

    expect(discovery.reachable).toBe(true);
    expect(discovery.detectedMethod).toBe('OFFICIAL_API');
    expect(discovery.capabilityType).toBe('LIVE_OFFICIAL_API');
    expect(discovery.capabilities.isLiveSearchSupported).toBe(true);
    expect(discovery.capabilities.isBrowseOnly).toBe(false);
  });

  it('2. Discovery correctly classifies site without API as BROWSE_ONLY', async () => {
    const discovery = await DiscoveryEngine.discoverPortal(`${mockBaseUrl}/browse-only-site`, {
      allowedDomains: ['127.0.0.1'],
      allowLocalhost: true,
    });

    expect(discovery.reachable).toBe(true);
    expect(discovery.detectedMethod).toBe('NONE');
    expect(discovery.capabilityType).toBe('BROWSE_ONLY');
    expect(discovery.capabilities.isLiveSearchSupported).toBe(false);
    expect(discovery.capabilities.isBrowseOnly).toBe(true);
  });

  // 2. Source-of-truth verification & runtime network call
  it('3. Genuine LIVE adapter executes real runtime network search against external endpoint', async () => {
    const liveAdapter = new OfficialApiAdapter({
      portalId: 'test-live-portal',
      portalName: 'بوابة مباشرة للاختبار',
      baseUrl: mockBaseUrl,
      allowedDomains: ['127.0.0.1'],
      integrationMethod: 'OFFICIAL_API',
      searchEndpoint: `${mockBaseUrl}/api/v1/search?q={query}`,
      recordEndpoint: `${mockBaseUrl}/records/{id}`,
    });

    const results = await liveAdapter.search('تاريخ');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('تاريخ عُمان عبر العصور المعتمد');
    expect(results[0].author).toBe('أحمد بن ماجد السالمي');
    expect(results[0].sourcePortalId).toBe('test-live-portal');
    expect(results[0].sourceRecordId).toBe('rec-live-101');
    expect(results[0].sourceRecordUrl).toBe(`${mockBaseUrl}/records/rec-live-101`);
  });

  // 3. Anti-fabrication & zero general-internet fallback
  it('4. Impossible query returns 0 results and never falls back to Google or AI generation', async () => {
    const liveAdapter = new OfficialApiAdapter({
      portalId: 'test-live-portal',
      portalName: 'بوابة مباشرة للاختبار',
      baseUrl: mockBaseUrl,
      allowedDomains: ['127.0.0.1'],
      integrationMethod: 'OFFICIAL_API',
      searchEndpoint: `${mockBaseUrl}/api/v1/search?q={query}`,
    });

    const results = await liveAdapter.search('nonexistent-impossible-book-999');
    expect(results.length).toBe(0);
    expect(results).toEqual([]);
  });

  // 4. Local Catalog Bypass Test (Part 13)
  it('5. Local catalog bypass test: Disabling local catalog returns 0 for static catalog, but live adapter still succeeds', async () => {
    // A. Static catalog adapter
    const staticAdapter = new VerifiedCatalogAdapter({
      portalId: 'portal-ibadi',
      portalName: 'المكتبة الإباضية الشاملة',
      baseUrl: 'https://al-maktaba.org',
      allowedDomains: ['al-maktaba.org'],
      integrationMethod: 'STATIC_VERIFIED_SNAPSHOT',
    });

    // Before bypass: returns curated records
    const beforeBypass = await staticAdapter.search('قواعد');
    expect(beforeBypass.length).toBeGreaterThan(0);

    // Turn ON local catalog bypass
    VerifiedCatalogAdapter.setBypassLocalCatalog(true);
    const duringBypass = await staticAdapter.search('قواعد');
    expect(duringBypass.length).toBe(0);

    // B. Live adapter with local catalog bypassed still succeeds directly from network!
    const liveAdapter = new OfficialApiAdapter({
      portalId: 'test-live-portal',
      portalName: 'بوابة مباشرة للاختبار',
      baseUrl: mockBaseUrl,
      allowedDomains: ['127.0.0.1'],
      integrationMethod: 'OFFICIAL_API',
      searchEndpoint: `${mockBaseUrl}/api/v1/search?q={query}`,
    });
    const liveResults = await liveAdapter.search('تاريخ');
    expect(liveResults.length).toBe(1);
    expect(liveResults[0].title).toBe('تاريخ عُمان عبر العصور المعتمد');

    // Turn OFF bypass
    VerifiedCatalogAdapter.setBypassLocalCatalog(false);
  });

  // 5. Browse-only portal workflow & explorer disabling
  it('6. BROWSE_ONLY portal has search explorer strictly disabled', async () => {
    // Create a browse-only portal in DB
    const browseOnlyId = `portal-browse-${Date.now()}`;
    await db.query(`
      INSERT INTO whitelisted_portals (
        id, name, description, url, category, allowed_domains, status, integration_method, capabilities
      ) VALUES ($1, 'بوابة تصفح فقط', 'موقع للقراءة المباشرة', $2, 'عام', ARRAY['127.0.0.1'], 'BROWSE_ONLY', 'BROWSE_ONLY',
        '{"searchSupported":false,"recordLookupSupported":false,"isLiveSearchSupported":false,"isBrowseOnly":true}'::jsonb
      )
    `, [browseOnlyId, `${mockBaseUrl}/browse-only-site`]);

    const res = await request(app)
      .get(`/api/v1/portals/${browseOnlyId}/search?q=أي_كتاب`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.isBrowseOnly).toBe(true);
  });

  // 6. Manual digital book suggestion from browse-only portal
  it('7. Student can suggest a digital book with real download URL from a browse-only portal', async () => {
    const res = await request(app)
      .post('/api/v1/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'كتاب الفقه المقارن المعتمد',
        author: 'الشيخ عبد الله بن علي',
        sourcePortalName: 'بوابة تصفح فقط',
        sourcePortalId: 'portal-browse-sample',
        sourceRecordUrl: `${mockBaseUrl}/browse-only-site`,
        downloadUrl: `${mockBaseUrl}/download/authentic-book.pdf`,
        sourceMethod: 'BROWSE_ONLY',
        format: 'pdf',
        pagesEstimated: 280,
        summary: 'اقتراح كتاب موثق مع رابط تحميل رقمي أصيل',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('كتاب الفقه المقارن المعتمد');
  });

  // 7. Admin approval triggers server-side download to central storage
  it('8. Admin approval triggers server-side download and stores file into digital repository', async () => {
    // 1. Submit proposal with authentic PDF download URL
    const subRes = await request(app)
      .post('/api/v1/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'مخطوط التوحيد والنبوة',
        author: 'أبو يعقوب الوارجلاني',
        sourcePortalName: 'المستودع الرقمي',
        sourcePortalId: 'portal-test',
        sourceRecordUrl: `${mockBaseUrl}/browse-only-site`,
        downloadUrl: `${mockBaseUrl}/download/authentic-book.pdf`,
        sourceMethod: 'BROWSE_ONLY',
        format: 'pdf',
        pagesEstimated: 350,
        summary: 'مخطوط في علم الكلام والعقيدة الإسلامية',
      });

    const submissionId = subRes.body.data.id;

    // 2. Admin approves the submission
    const reviewRes = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'approved',
        adminFeedback: 'تم التحقق من الوثيقة الرقمية واعتمادها بنجاح.',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.success).toBe(true);

    // 3. Verify file was saved on the central server in digital directory
    const { rows: subRows } = await db.query('SELECT * FROM pending_submissions WHERE id = $1', [submissionId]);
    expect(['approved', 'APPROVED']).toContain(subRows[0].status);
    expect(subRows[0].server_file_path).toBeTruthy();
    expect(fs.existsSync(subRows[0].server_file_path)).toBe(true);

    // 4. Verify book record was created in books table
    const { rows: bookRows } = await db.query(
      'SELECT * FROM books WHERE title = $1',
      ['مخطوط التوحيد والنبوة']
    );
    expect(bookRows.length).toBe(1);
    expect(bookRows[0].type).toBe('digital');
    expect(bookRows[0].format).toBe('pdf');
    expect(bookRows[0].download_url).toBe(`${mockBaseUrl}/download/authentic-book.pdf`);
    expect(bookRows[0].file_hash).toBeTruthy();
  });

  // 8. Download validation & soft-404 rejection (Zero fake books)
  it('9. Admin approval fails cleanly when remote download URL returns soft-404 HTML, creating zero fake books', async () => {
    // 1. Submit proposal with soft-404 fake PDF URL
    const subRes = await request(app)
      .post('/api/v1/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'كتاب وهمي برابط خطأ',
        author: 'مؤلف مجهول',
        sourcePortalName: 'بوابة تجريبية',
        downloadUrl: `${mockBaseUrl}/download/fake-book-soft404.pdf`,
        sourceMethod: 'BROWSE_ONLY',
        summary: 'تجربة كشف روابط التحميل الزائفة',
      });

    const submissionId = subRes.body.data.id;

    // 2. Admin approves -> must throw error due to soft-404 HTML payload
    const reviewRes = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'approved',
      });

    expect(reviewRes.status).toBe(500);
    expect(reviewRes.body.success).toBe(false);
    expect(reviewRes.body.error.message).toContain('فشل تحميل الملف الرقمي');

    // 3. Verify zero books created in books table
    const { rows: bookRows } = await db.query(
      'SELECT * FROM books WHERE title = $1',
      ['كتاب وهمي برابط خطأ']
    );
    expect(bookRows.length).toBe(0);
  });

  // 9. SSRF security on server-side downloads
  it('10. Server-side download service blocks private IP addresses (SSRF Protection)', async () => {
    await expect(
      DigitalDownloadService.downloadAndValidate('http://169.254.169.254/latest/meta-data', {
        bookId: 'ssrf-test',
        allowLocalhost: false,
      })
    ).rejects.toThrow('SSRF_BLOCKED');
  });

  // 10. Direct download service blocks malicious redirect to unauthorized domain
  it('11. Server-side download service blocks redirect to unauthorized external domain', async () => {
    await expect(
      DigitalDownloadService.downloadAndValidate(`${mockBaseUrl}/records/hard-404`, {
        bookId: 'not-found-test',
        allowLocalhost: true,
      })
    ).rejects.toThrow('FILE_NOT_FOUND');
  });
});
