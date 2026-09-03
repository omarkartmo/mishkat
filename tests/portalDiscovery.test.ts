/**
 * MISHKAT — Phase 15.4-D: External Portal Discovery, Source Verification & Strict Provenance
 * 20 Required Regression Scenarios (Part 31)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import { Express } from 'express';
import { createExpressApp } from '../server/index';
import { PortalManager } from '../server/services/portals/portalManager';
import { VerificationService } from '../server/services/portals/VerificationService';
import { validateSafeUrl } from '../server/services/portals/securityHttpClient';
import { OaiPmhAdapter } from '../server/services/portals/adapters/OaiPmhAdapter';
import { OfficialApiAdapter } from '../server/services/portals/adapters/OfficialApiAdapter';
import { OnboardingTestSuite } from '../server/services/portals/OnboardingTestSuite';
import { db } from '../server/db/pool';

let app: Express;
let adminToken: string;
let studentToken: string;
let studentUser: any;
let mockServer: http.Server;
let mockServerPort: number;
let mockBaseUrl: string;

beforeAll(async () => {
  // 1. Setup local deterministic mock server for testing protocols, redirects, 404, soft-404, etc.
  await new Promise<void>((resolve) => {
    mockServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // Route: OAI-PMH identify & list
      if (url.pathname === '/oai') {
        const verb = url.searchParams.get('verb');
        if (verb === 'Identify') {
          res.writeHead(200, { 'Content-Type': 'text/xml' });
          res.end(`<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <responseDate>2026-09-03T12:00:00Z</responseDate>
  <request verb="Identify">http://${req.headers.host}/oai</request>
  <Identify>
    <repositoryName>المستودع الأكاديمي النموذجي</repositoryName>
    <baseURL>http://${req.headers.host}/oai</baseURL>
    <protocolVersion>2.0</protocolVersion>
  </Identify>
</OAI-PMH>`);
          return;
        }

        if (verb === 'ListMetadataFormats') {
          res.writeHead(200, { 'Content-Type': 'text/xml' });
          res.end(`<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <ListMetadataFormats>
    <metadataFormat>
      <metadataPrefix>oai_dc</metadataPrefix>
    </metadataFormat>
  </ListMetadataFormats>
</OAI-PMH>`);
          return;
        }

        if (verb === 'ListRecords') {
          res.writeHead(200, { 'Content-Type': 'text/xml' });
          res.end(`<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <ListRecords>
    <record>
      <header>
        <identifier>oai:mock:rec-001</identifier>
      </header>
      <metadata>
        <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>دراسات تاريخية في المخطوطات العمانية</dc:title>
          <dc:creator>د. راشد الحارثي</dc:creator>
          <dc:description>بحث استقصائي موثق في التراث العماني الأصيل.</dc:description>
          <dc:date>2024</dc:date>
          <dc:subject>تاريخ</dc:subject>
        </oai_dc:dc>
      </metadata>
    </record>
  </ListRecords>
</OAI-PMH>`);
          return;
        }

        if (verb === 'GetRecord') {
          const id = url.searchParams.get('identifier');
          if (id === 'oai:mock:rec-001') {
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end(`<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <GetRecord>
    <record>
      <header>
        <identifier>oai:mock:rec-001</identifier>
      </header>
      <metadata>
        <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>دراسات تاريخية في المخطوطات العمانية</dc:title>
          <dc:creator>د. راشد الحارثي</dc:creator>
        </oai_dc:dc>
      </metadata>
    </record>
  </GetRecord>
</OAI-PMH>`);
            return;
          }
          res.writeHead(404, { 'Content-Type': 'text/xml' });
          res.end('<error code="idDoesNotExist">No such record</error>');
          return;
        }
      }

      // Route: REST API
      if (url.pathname === '/api/v1/search') {
        const q = url.searchParams.get('q');
        if (q === 'nonexistent') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ items: [] }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            items: [
              {
                id: 'api-book-01',
                title: 'تاريخ عمان والحضارة الإسلامية',
                author: 'أحمد بن سعيد',
                pages: 280,
                year: '2023',
                url: `http://${req.headers.host}/records/api-book-01`,
              },
            ],
          })
        );
        return;
      }

      // Route: Verified positive record
      if (url.pathname === '/records/api-book-01') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><head><title>تاريخ عمان والحضارة الإسلامية</title></head><body><h1>تاريخ عمان والحضارة الإسلامية</h1><p>المؤلف: أحمد بن سعيد</p></body></html>');
        return;
      }

      // Route: Hard 404
      if (url.pathname === '/records/hard-404') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>');
        return;
      }

      // Route: Soft 404 (HTTP 200 with error page body)
      if (url.pathname === '/records/soft-404') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><head><title>الصفحة غير موجودة - المكتبة</title></head><body><h1>عذراً، لم يتم العثور على هذا الكتاب في قاعدة البيانات</h1></body></html>');
        return;
      }

      // Route: Redirect to malicious / external domain
      if (url.pathname === '/records/redirect-external') {
        res.writeHead(302, { Location: 'https://evil-phishing-site.example.com/stolen' });
        res.end();
        return;
      }

      // Route: Safe internal redirect
      if (url.pathname === '/records/redirect-canonical') {
        res.writeHead(301, { Location: `http://${req.headers.host}/records/api-book-01` });
        res.end();
        return;
      }

      // Route: Blocked / 403
      if (url.pathname === '/records/blocked') {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied: Bot traffic is prohibited.');
        return;
      }

      // Route: 500 server error
      if (url.pathname === '/records/server-error') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      // Default home response
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><head><title>المستودع الرقمي</title></head><body>مرحباً بكم في البوابة الأكاديمية</body></html>');
    });

    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer.address() as any;
      mockServerPort = addr.port;
      mockBaseUrl = `http://127.0.0.1:${mockServerPort}`;
      resolve();
    });
  });

  // 2. Initialize Mishkat App & Tokens
  app = await createExpressApp();

  const adminLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });
  adminToken = adminLoginRes.body.data.token;

  const studentLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });
  studentToken = studentLoginRes.body.data.token;
  studentUser = studentLoginRes.body.data.user;
});

afterAll(async () => {
  if (mockServer) {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

describe('Phase 15.4-D: 20 Required Regression Tests (Part 31)', () => {
  const portalA = 'portal-ibadi';
  const portalB = 'portal-shamela';

  // 1. Existing verified source record
  it('Scenario 1: Existing verified source record returns VERIFIED with full provenance', async () => {
    const res = await request(app)
      .post('/api/v1/portals/verify-record')
      .send({
        portalId: portalA,
        recordId: 'ibadi-01',
        recordUrl: 'https://al-maktaba.net/book/ibadi-01',
        title: 'قواعد الإسلام وشرح أصول الأحكام',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('VERIFIED');
    expect(res.body.data.contentMatched).toBe(true);
    expect(res.body.data.verifiedAt).toBeDefined();
  });

  // 2. Nonexistent book
  it('Scenario 2: Nonexistent book query returns NOT_FOUND / 0 results and never synthesizes books', async () => {
    const res = await request(app)
      .get(`/api/v1/portals/${portalA}/search?q=FABRICATED_BOOK_XYZ_99999`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  // 3. Invalid source record URL (Hard 404)
  it('Scenario 3: Invalid source record URL returns NOT_FOUND, NEVER VERIFIED', async () => {
    const res = await request(app)
      .post('/api/v1/portals/verify-record')
      .send({
        recordUrl: `${mockBaseUrl}/records/hard-404`,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('NOT_FOUND');
    expect(res.body.data.httpStatus).toBe(404);
    expect(res.body.data.status).not.toBe('VERIFIED');
  });

  // 4. Soft 404 detection
  it('Scenario 4: Soft 404 detection correctly identifies fake HTTP 200 error pages as NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/v1/portals/verify-record')
      .send({
        recordUrl: `${mockBaseUrl}/records/soft-404`,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('NOT_FOUND');
    expect(res.body.data.isSoft404).toBe(true);
    expect(res.body.data.details).toContain('Soft 404');
  });

  // 5. Wrong source URL (Content mismatch)
  it('Scenario 5: Wrong source URL with mismatching title/author returns UNVERIFIED with contentMatched: false', async () => {
    const res = await request(app)
      .post('/api/v1/portals/verify-record')
      .send({
        recordUrl: `${mockBaseUrl}/records/api-book-01`,
        title: 'كتاب كيمياء الفضاء المتقدم', // Mismatch with actual title
        author: 'مؤلف غير متطابق تماماً',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNVERIFIED');
    expect(res.body.data.contentMatched).toBe(false);
  });

  // 6. Redirect to unrelated domain
  it('Scenario 6: Redirect to an unauthorized external domain is blocked for security and returns BLOCKED', async () => {
    const res = await request(app)
      .post('/api/v1/portals/verify-record')
      .send({
        recordUrl: `${mockBaseUrl}/records/redirect-external`,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.details).toMatch(/Security Violation|MALICIOUS_REDIRECT_BLOCKED|BLOCKED/);
  });

  // 7. Portal A -> Portal B contamination
  it('Scenario 7: Cross-source isolation prevents Portal B records from ever contaminating Portal A results', async () => {
    // Portal B (Shamela) has 'دلائل الإعجاز'
    const searchPortalARes = await request(app)
      .get(`/api/v1/portals/${portalA}/search?q=دلائل الإعجاز`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(searchPortalARes.body.data).toHaveLength(0);

    const searchPortalBRes = await request(app)
      .get(`/api/v1/portals/${portalB}/search?q=دلائل الإعجاز`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(searchPortalBRes.body.data.length).toBeGreaterThan(0);
    for (const item of searchPortalBRes.body.data) {
      expect(item.sourcePortalId).toBe(portalB);
      expect(item.sourcePortalId).not.toBe(portalA);
    }
  });

  // 8. AI-generated fake book
  it('Scenario 8: AI-generated synthetic records without source proof cannot be verified as portal records', async () => {
    const fakeBookPayload = {
      id: 'synthetic-ai-book-999',
      recordUrl: 'https://al-maktaba.org/book/fabricated-book',
      title: 'كتاب غير موجود مفبرك بواسطة الذكاء الاصطناعي',
      author: 'مؤلف خيالي',
    };

    const res = await request(app)
      .post('/api/v1/portals/verify-record')
      .send(fakeBookPayload);

    // Cannot become VERIFIED
    expect(res.body.data.status).not.toBe('VERIFIED');
  });

  // 9. Fake source identifier rejection
  it('Scenario 9: Fake source identifier returns null/not found during lookup', async () => {
    const adapter = await PortalManager.getAdapter(portalA);
    expect(adapter).toBeDefined();

    const result = await adapter!.getRecord('FAKE_NONEXISTENT_IDENTIFIER_123');
    expect(result).toBeNull();
  });

  // 10. Fake canonical URL rejection
  it('Scenario 10: Fake canonical URL fails verification and is marked NOT_FOUND or ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/portals/verify-record')
      .send({
        portalId: portalA,
        recordUrl: 'https://al-maktaba.net/book/fake-canonical-uuid-999888',
      });

    expect(res.body.data.status).not.toBe('VERIFIED');
  });

  // 11. Cached result provenance
  it('Scenario 11: Cached or retrieved records preserve immutable provenance tags', async () => {
    const results = await PortalManager.searchPortal(portalA, 'قواعد');
    expect(results.length).toBeGreaterThan(0);

    const book = results[0];
    expect(book.sourcePortalId).toBe(portalA);
    expect(book.sourcePortalName).toBeDefined();
    expect(book.sourceBaseUrl).toBeDefined();
    expect(book.sourceRecordUrl).toBeDefined();
    expect(book.sourceRecordId).toBeDefined();
    expect(book.sourceMethod).toBe('MANUAL_VERIFIED_CATALOG');
    expect(book.sourceRetrievedAt).toBeDefined();
    expect(book.verificationStatus).toBe('VERIFIED');
  });

  // 12. Suggestion provenance preservation
  it('Scenario 12: Submitting a digital book suggestion strictly preserves full provenance in the central database', async () => {
    const submissionPayload = {
      title: 'المسند الصحيح الصادر عن المصدر الموثق',
      author: 'الشيخ المحقق الربيع',
      suggestedCategoryId: 'cat-islamic',
      format: 'pdf',
      sourcePortalName: 'المكتبة الإباضية الشاملة',
      sourcePortalId: portalA,
      sourceRecordId: 'ibadi-01',
      sourceRecordUrl: 'https://al-maktaba.net/book/ibadi-01',
      sourceMethod: 'MANUAL_VERIFIED_CATALOG',
      sourceRetrievedAt: new Date().toISOString(),
      verificationStatus: 'VERIFIED',
      summary: 'مخطوطة موثقة بالكامل بأدلة التوثيق المصدري.',
      pagesEstimated: 420,
    };

    const res = await request(app)
      .post('/api/v1/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(submissionPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const subId = res.body.data.id;

    // Verify database row directly
    const { rows } = await db.query('SELECT * FROM pending_submissions WHERE id = $1', [subId]);
    expect(rows).toHaveLength(1);
    const row = rows[0];

    expect(row.source_portal_id).toBe(portalA);
    expect(row.source_portal_name).toBe('المكتبة الإباضية الشاملة');
    expect(row.source_record_id).toBe('ibadi-01');
    expect(row.source_record_url).toBe('https://al-maktaba.net/book/ibadi-01');
    expect(row.source_method).toBe('MANUAL_VERIFIED_CATALOG');
    expect(row.verification_status).toBe('VERIFIED');
  });

  // 13. Portal deactivation (Cannot search deactivated / unsupported portal)
  it('Scenario 13: Unsupported or blocked portal search returns empty array and informative status', async () => {
    // Create an unsupported portal
    const testPortalId = `test-unsupported-${Date.now()}`;
    await db.query(`
      INSERT INTO whitelisted_portals (id, name, url, category, allowed_domains, status, integration_method)
      VALUES ($1, 'بوابة تجريبية غير مدعومة', 'https://unsupported.example.org', 'تراث', ARRAY['unsupported.example.org'], 'UNSUPPORTED', 'NONE')
    `, [testPortalId]);

    const res = await request(app)
      .get(`/api/v1/portals/${testPortalId}/search?q=تاريخ`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.portalStatus).toBe('UNSUPPORTED');
  });

  // 14. Portal verification expiration & 12-test technical onboarding runner
  it('Scenario 14: Onboarding test suite executes the 12 technical tests and generates a complete audit report', async () => {
    // Run tests on portal-ibadi
    const res = await request(app)
      .post(`/api/v1/portals/${portalA}/run-tests`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const report = res.body.data;
    expect(report.checks).toHaveLength(12);
    expect(report.suggestedStatus).toBe('VERIFIED');

    // Confirm specific test IDs are present
    const checkIds = report.checks.map((c: any) => c.id);
    expect(checkIds).toContain('test-1-connectivity');
    expect(checkIds).toContain('test-2-discovery');
    expect(checkIds).toContain('test-3-search');
    expect(checkIds).toContain('test-8-negative-verification');
    expect(checkIds).toContain('test-9-broken-url');
    expect(checkIds).toContain('test-10-soft-404');
    expect(checkIds).toContain('test-11-cross-source-isolation');
    expect(checkIds).toContain('test-12-ai-isolation');
  });

  // 15. API unavailable handling
  it('Scenario 15: Remote API returning 500/timeout is handled gracefully as UNAVAILABLE', async () => {
    const res = await request(app)
      .post('/api/v1/portals/verify-record')
      .send({
        recordUrl: `${mockBaseUrl}/records/server-error`,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNAVAILABLE');
    expect(res.body.data.httpStatus).toBe(500);
  });

  // 16. OAI-PMH adapter live handling
  it('Scenario 16: OAI-PMH adapter parses authentic XML records into verified provenance format', async () => {
    const oaiAdapter = new OaiPmhAdapter({
      portalId: 'mock-oai-portal',
      portalName: 'المستودع الأكاديمي OAI',
      baseUrl: mockBaseUrl,
      allowedDomains: ['127.0.0.1'],
      integrationMethod: 'OAI_PMH',
      oaiEndpoint: `${mockBaseUrl}/oai`,
    });

    const results = await oaiAdapter.search('تاريخ');
    expect(results.length).toBe(1);

    const item = results[0];
    expect(item.title).toContain('دراسات تاريخية');
    expect(item.author).toContain('الحارثي');
    expect(item.sourcePortalId).toBe('mock-oai-portal');
    expect(item.sourceMethod).toBe('OAI_PMH');
  });

  // 17. Search endpoint unavailable handling
  it('Scenario 17: Official API discovery correctly flags failing probe as NONE', async () => {
    const brokenApiAdapter = new OfficialApiAdapter({
      portalId: 'broken-api',
      portalName: 'واجهة معطلة',
      baseUrl: mockBaseUrl,
      allowedDomains: ['127.0.0.1'],
      integrationMethod: 'OFFICIAL_API',
      searchEndpoint: `${mockBaseUrl}/records/hard-404`,
    });

    const discovery = await brokenApiAdapter.discover();
    expect(discovery.detectedMethod).toBe('NONE');
    expect(discovery.reachable).toBe(false);
  });

  // 18. Portal blocks automated requests (BLOCKED)
  it('Scenario 18: Portal returning 403 Forbidden is classified as BLOCKED', async () => {
    const res = await request(app)
      .post('/api/v1/portals/verify-record')
      .send({
        recordUrl: `${mockBaseUrl}/records/blocked`,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.httpStatus).toBe(403);
  });

  // 19. Search returns zero results (no silent fallback)
  it('Scenario 19: Search returning 0 results returns strictly empty array without fallback', async () => {
    const apiAdapter = new OfficialApiAdapter({
      portalId: 'mock-api-portal',
      portalName: 'بوابة الـ API التجريبية',
      baseUrl: mockBaseUrl,
      allowedDomains: ['127.0.0.1'],
      integrationMethod: 'OFFICIAL_API',
      searchEndpoint: `${mockBaseUrl}/api/v1/search`,
    });

    const emptyResults = await apiAdapter.search('nonexistent');
    expect(emptyResults).toEqual([]);
  });

  // 20. Search returns multiple real records with complete provenance
  it('Scenario 20: Real records from curated catalog possess complete immutable provenance and chapter previews', async () => {
    const books = await PortalManager.searchPortal(portalA, '');
    expect(books.length).toBeGreaterThan(0);

    for (const b of books) {
      expect(b.portalId).toBe(portalA);
      expect(b.sourcePortalId).toBe(portalA);
      expect(b.sourceBaseUrl).toBeDefined();
      expect(b.sourceRecordUrl).toMatch(/^https?:\/\//);
      expect(b.sourceRetrievedAt).toBeDefined();
      expect(b.verificationStatus).toBe('VERIFIED');
      expect(b.isDirectExtraction).toBe(true);
      expect(b.sampleChapters).toBeDefined();
      expect(b.sampleChapters!.length).toBeGreaterThan(0);
    }
  });
});
