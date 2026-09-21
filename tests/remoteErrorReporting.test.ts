import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { db } from '../server/db/pool';
import { runMigrations } from '../server/db/migrator';
import { seedInitialData } from '../server/db/seed';
import { supportAgentService } from '../server/services/supportAgentService';
import { app as supportServerApp, db as supportDb } from '../tools/support-server/index.cjs';

const TEST_PORT = 4099;
const TEST_DEV_API_URL = `http://127.0.0.1:${TEST_PORT}/api/v1/support/reports`;

describe('Remote Error Reporting End-to-End Test Suite', () => {
  let serverInstance: http.Server | null = null;

  beforeAll(async () => {
    await db.connect();
    await runMigrations();
    await seedInitialData();

    // Start Master Support Server on test port
    await new Promise<void>((resolve) => {
      serverInstance = supportServerApp.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (serverInstance) {
      await new Promise<void>((resolve) => serverInstance!.close(() => resolve()));
    }
  });

  beforeEach(async () => {
    // Clean institution test outbound queue
    await db.query('DELETE FROM support_outbound_queue');
  });

  it('1. Complete Cycle: Error → Outbound Queue (pending) → Dev API → SQLite Storage → ACK → Queue (sent)', async () => {
    const rawSecretPassword = 'UltraConfidentialPassword999';
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis';

    // 1. Enqueue error on Institution Server
    const reportId = await supportAgentService.enqueueOutboundReport({
      sourceType: 'server',
      component: 'database_pool',
      errorType: 'connection_pool_timeout',
      errorCode: 'ERR_POOL_TIMEOUT',
      severity: 'critical',
      message: `Database connection pool timeout with password=${rawSecretPassword} and token=${fakeJwt}`,
      stackTrace: 'Error at pool.ts:120\n    at query (pool.ts:45)',
      diagnosticContext: {
        poolSize: 10,
        activeClients: 10,
        password: rawSecretPassword,
      },
    });

    expect(reportId).toBeDefined();

    // Verify initial status is pending (or already attempted)
    const { rows: initialRows } = await db.query(
      'SELECT * FROM support_outbound_queue WHERE report_id = $1',
      [reportId]
    );
    expect(initialRows.length).toBe(1);

    // 2. Flush queue to Developer Master Support API
    const flushResult = await supportAgentService.flushOutboundQueue(TEST_DEV_API_URL);
    expect(flushResult.sent).toBeGreaterThanOrEqual(1);

    // 3. Verify Institution Server marks report as 'sent'
    const { rows: sentRows } = await db.query(
      'SELECT * FROM support_outbound_queue WHERE report_id = $1',
      [reportId]
    );
    expect(sentRows[0].status).toBe('sent');
    expect(sentRows[0].sent_at).not.toBeNull();

    // 4. Verify Developer SQLite Storage has the exact record
    const stored = supportDb.prepare('SELECT * FROM support_reports WHERE report_id = ?').get(reportId) as any;
    expect(stored).toBeDefined();
    expect(stored.report_id).toBe(reportId);
    expect(stored.error_code).toBe('ERR_POOL_TIMEOUT');
    expect(stored.severity).toBe('critical');

    // 5. Verify data sanitization: sensitive credentials NEVER reach developer storage
    expect(stored.sanitized_message).not.toContain(rawSecretPassword);
    expect(stored.sanitized_message).toContain('[REDACTED_PASSWORD]');
    expect(stored.sanitized_message).not.toContain(fakeJwt);
    expect(stored.sanitized_message).toContain('[REDACTED_JWT]');

    const parsedContext = JSON.parse(stored.diagnostic_context);
    expect(parsedContext.password).toBe('[REDACTED]');
  });

  it('2. Developer API unavailable: report remains pending/failed and local server continues safely', async () => {
    const reportId = await supportAgentService.enqueueOutboundReport({
      sourceType: 'server',
      component: 'offline_test',
      errorType: 'offline_error',
      errorCode: 'ERR_OFFLINE',
      severity: 'warning',
      message: 'Testing behavior when Developer PC is unreachable',
    });

    // Attempt flush to an unreachable port
    const unreachableUrl = 'http://127.0.0.1:49999/api/v1/support/reports';
    const flushResult = await supportAgentService.flushOutboundQueue(unreachableUrl);

    expect(flushResult.sent).toBe(0);
    expect(flushResult.failed).toBe(1);

    // Verify row status is 'failed' with exponential retry backoff scheduled
    const { rows } = await db.query(
      'SELECT * FROM support_outbound_queue WHERE report_id = $1',
      [reportId]
    );
    expect(rows[0].status).toBe('failed');
    expect(rows[0].attempts_count).toBeGreaterThanOrEqual(1);
    expect(rows[0].next_retry_at).not.toBeNull();
  });

  it('3. API Recovery: failed report is resent and marked sent when API becomes available', async () => {
    // 1. Enqueue a report and simulate previous failed attempt
    const reportId = await supportAgentService.enqueueOutboundReport({
      sourceType: 'server',
      component: 'recovery_test',
      errorType: 'transient_network_error',
      errorCode: 'ERR_TRANSIENT',
      severity: 'warning',
      message: 'Initial failure before API came back online',
    });

    // Mark it as failed initially (e.g. from previous offline cycle) with past next_retry_at
    await db.query(`
      UPDATE support_outbound_queue
      SET status = 'failed',
          attempts_count = 1,
          next_retry_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
      WHERE report_id = $1
    `, [reportId]);

    // 2. Retry sending to live Developer API
    const flushResult = await supportAgentService.flushOutboundQueue(TEST_DEV_API_URL);
    expect(flushResult.sent).toBeGreaterThanOrEqual(1);

    // 3. Verify status transitioned to 'sent'
    const { rows } = await db.query(
      "SELECT * FROM support_outbound_queue WHERE report_id = $1",
      [reportId]
    );
    expect(rows[0].status).toBe('sent');
    expect(rows[0].sent_at).not.toBeNull();
  });

  it('4. Idempotency: Duplicate report returns valid duplicate ACK without duplicate database records', async () => {
    const uniqueReportId = `idempotent_test_${Date.now()}`;

    // First submission
    const res1 = await fetch(TEST_DEV_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Institution-Id': 'TEST-INST-IDEM',
        'X-Installation-Id': 'TEST-INS-IDEM',
        'X-Support-Key': 'msk_test_secret_key_idem_123',
      },
      body: JSON.stringify({
        reportId: uniqueReportId,
        component: 'idempotency_module',
        errorCode: 'ERR_IDEM',
        severity: 'info',
        sanitizedMessage: 'Initial transmission',
      }),
    });

    const data1 = await res1.json();
    expect(res1.status).toBe(200);
    expect(data1.acknowledged).toBe(true);
    expect(data1.reportId).toBe(uniqueReportId);
    expect(data1.duplicate).toBe(false);

    // Second submission with exact same reportId
    const res2 = await fetch(TEST_DEV_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Institution-Id': 'TEST-INST-IDEM',
        'X-Installation-Id': 'TEST-INS-IDEM',
        'X-Support-Key': 'msk_test_secret_key_idem_123',
      },
      body: JSON.stringify({
        reportId: uniqueReportId,
        component: 'idempotency_module',
        errorCode: 'ERR_IDEM',
        severity: 'info',
        sanitizedMessage: 'Duplicate transmission attempt',
      }),
    });

    const data2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(data2.acknowledged).toBe(true);
    expect(data2.reportId).toBe(uniqueReportId);
    expect(data2.duplicate).toBe(true);

    // Verify SQLite storage only has 1 record
    const countResult = supportDb.prepare(
      'SELECT COUNT(*) as count FROM support_reports WHERE report_id = ?'
    ).get(uniqueReportId) as any;

    expect(countResult.count).toBe(1);
  });

  it('5. Authentication: Invalid Support Key is rejected and report is NOT marked sent', async () => {
    // Submit with wrong support key
    const res = await fetch(TEST_DEV_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Institution-Id': 'TEST-INST-IDEM', // Already enrolled with msk_test_secret_key_idem_123
        'X-Installation-Id': 'TEST-INS-IDEM',
        'X-Support-Key': 'WRONG_INVALID_KEY_ATTEMPT',
      },
      body: JSON.stringify({
        reportId: `auth_fail_${Date.now()}`,
        component: 'security_test',
        errorCode: 'ERR_UNAUTHORIZED',
        sanitizedMessage: 'Should be rejected',
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.acknowledged).toBe(false);
  });
});
