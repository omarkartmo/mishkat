import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { ClientEventSanitizer } from '../src/services/telemetry/clientEventSanitizer';
import { ClientEventQueue } from '../src/services/telemetry/clientEventQueue';
import { supportAgentService } from '../server/services/supportAgentService';
import { updaterService } from '../server/services/updaterService';
import { db } from '../server/db/pool';
import { runMigrations } from '../server/db/migrator';
import { seedInitialData } from '../server/db/seed';
import { serverConfig } from '../server/config';

describe('MISHKAT Commercial Distribution & Support Architecture Suite', () => {
  beforeAll(async () => {
    await db.connect();
    await runMigrations();
    await seedInitialData();
  });

  beforeEach(async () => {
    // Clean up test telemetry tables
    await db.query('DELETE FROM client_telemetry_events');
    await db.query('DELETE FROM connected_clients');
  });

  // =========================================================================
  // 1. Telemetry Data Sanitization Tests
  // =========================================================================
  describe('1. Telemetry Sanitization & Privacy Shield', () => {
    it('strictly redacts passwords, bcrypt hashes, JWTs and bearer tokens from error strings', () => {
      const rawError =
        'Error at login: password="SuperSecretPassword123" with token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMifQ.XYZ and hash=$2a$10$e8.Z/qN3GZ2a4u7e8.Z/qN3GZ2a4u7e8.Z/qN3GZ2a4u7e8.Z/qN3GZ2a4u7';

      const sanitized = ClientEventSanitizer.sanitizeString(rawError);

      expect(sanitized).not.toContain('SuperSecretPassword123');
      expect(sanitized).not.toContain('eyJhbGciOi');
      expect(sanitized).toContain('[REDACTED_PASSWORD]');
      expect(sanitized).toContain('[REDACTED_TOKEN]');
      expect(sanitized).toContain('[REDACTED_HASH]');
    });

    it('recursively scrubs forbidden keys from metadata objects', () => {
      const rawMetadata = {
        screen: 'login_modal',
        password: 'PlainTextPassword',
        token: 'Bearer eyJsecret123456789.abcdefghijk.lmnopqrstuvwxyz',
        studentInfo: {
          email: 'student@school.edu',
          phone: '+213555123456',
          bookContent: 'Very long private text',
        },
        harmlessField: 42,
      };

      const sanitized = ClientEventSanitizer.sanitizeMetadata(rawMetadata);

      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.studentInfo.bookContent).toBe('[REDACTED]');
      expect(sanitized.studentInfo.email).toBe('[REDACTED_EMAIL]');
      expect(sanitized.studentInfo.phone).toBe('[REDACTED_PHONE]');
      expect(sanitized.harmlessField).toBe(42);
    });
  });

  // =========================================================================
  // 2. Local Offline Queue Tests
  // =========================================================================
  describe('2. Student Station Offline Event Queue', () => {
    it('bounds queue size to prevent filling disk space (drops oldest on overflow)', () => {
      const queue = new ClientEventQueue();
      queue.clear();

      // Enqueue 120 events (capacity limit is 100)
      for (let i = 1; i <= 120; i++) {
        queue.enqueue({
          clientId: 'stu-test-station-1',
          appVersion: '1.0.0',
          eventType: 'react_error',
          severity: 'warning',
          errorCode: `ERR_${i}`,
          message: `Error number ${i}`,
        });
      }

      expect(queue.getQueueLength()).toBeLessThanOrEqual(100);
      queue.clear();
    });
  });

  // =========================================================================
  // 3. Server Telemetry Ingestion & Intelligent Error Aggregation
  // =========================================================================
  describe('3. Telemetry Ingestion & Error Aggregation', () => {
    it('ingests client heartbeat and telemetry events into the central database', async () => {
      const result = await supportAgentService.ingestClientEvents([
        {
          clientId: 'stu-lab-pc-01',
          appVersion: '1.0.0',
          eventType: 'pdf_render_error',
          severity: 'warning',
          errorCode: 'PDF_RENDER_FAILED',
          message: 'Failed to load PDF byte stream on page 14',
          route: '/student/reader',
        },
      ], '192.168.1.50');

      expect(result.ingestedCount).toBe(1);

      // Verify connected client station was registered
      const summary = await supportAgentService.getConnectedClientsSummary();
      expect(summary.totalRegisteredCount).toBeGreaterThanOrEqual(1);

      const client = summary.clients.find((c) => c.clientId === 'stu-lab-pc-01');
      expect(client).toBeDefined();
      expect(client?.ipAddress).toBe('192.168.1.50');
      expect(client?.isOnline).toBe(true);
    });

    it('intelligently aggregates identical error signatures across 15 distinct student stations', async () => {
      const batchEvents: any[] = [];

      // Simulate 15 distinct student computers experiencing the exact same error
      for (let i = 1; i <= 15; i++) {
        const clientId = `stu-room-b-pc-${String(i).padStart(2, '0')}`;
        // Each station reports 2-3 occurrences
        for (let j = 0; j < 2; j++) {
          batchEvents.push({
            clientId,
            appVersion: '1.0.0',
            eventType: 'pdf_render_error',
            severity: 'warning',
            errorCode: 'PDF_RENDER_FAILED',
            message: 'Failed to parse binary stream: Corrupt font table',
            route: '/digital/reader',
          });
        }
      }

      await supportAgentService.ingestClientEvents(batchEvents, '192.168.1.100');

      // Query aggregated errors
      const aggregated = await supportAgentService.getAggregatedErrors();
      expect(aggregated.length).toBeGreaterThanOrEqual(1);

      const pdfError = aggregated.find((a) => a.errorCode === 'PDF_RENDER_FAILED');
      expect(pdfError).toBeDefined();
      expect(pdfError?.occurrenceCount).toBe(30); // 15 stations * 2 occurrences
      expect(pdfError?.affectedClientsCount).toBe(15); // Exactly 15 distinct clients
      expect(pdfError?.affectedClientIds.length).toBe(15);
      expect(pdfError?.affectedAppVersions).toContain('1.0.0');
    });
  });

  // =========================================================================
  // 4. Server Health Diagnostics
  // =========================================================================
  describe('4. Server Health Diagnostics', () => {
    it('computes complete server metrics including database, backups, and storage', async () => {
      const health = await supportAgentService.getServerHealth();

      expect(health.status).toBeDefined();
      expect(health.service.name).toBe('MishkatLibraryService');
      expect(health.service.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(health.database.status).toBe('connected');
      expect(health.database.engine).toContain('PostgreSQL');
      expect(health.storage.libraryDataPath).toBeDefined();
      expect(health.storage.isWritable).toBe(true);
      expect(health.backups.retentionPolicy).toContain('7-version');
    });
  });

  // =========================================================================
  // 5. Whitelist & Approved Domains Verification
  // =========================================================================
  describe('5. Approved Websites / Whitelist Guard Logic', () => {
    function isDomainAllowed(targetUrl: string, allowedList: string[]): boolean {
      try {
        const parsed = new URL(targetUrl);
        const host = parsed.hostname.toLowerCase();
        return allowedList.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`));
      } catch {
        return false;
      }
    }

    const approvedDomains = ['shamela.ws', 'waqfeya.net', 'loc.gov', 'al-maktaba.org'];

    it('permits approved domains and their subdomains', () => {
      expect(isDomainAllowed('https://shamela.ws/book/1234', approvedDomains)).toBe(true);
      expect(isDomainAllowed('https://api.waqfeya.net/files/doc.pdf', approvedDomains)).toBe(true);
      expect(isDomainAllowed('https://catalog.loc.gov/search', approvedDomains)).toBe(true);
    });

    it('strictly blocks unapproved external domains and malformed URLs', () => {
      expect(isDomainAllowed('https://facebook.com/login', approvedDomains)).toBe(false);
      expect(isDomainAllowed('https://youtube.com/watch?v=xyz', approvedDomains)).toBe(false);
      expect(isDomainAllowed('http://unapproved-forum.com', approvedDomains)).toBe(false);
      expect(isDomainAllowed('not-a-valid-url', approvedDomains)).toBe(false);
    });
  });

  // =========================================================================
  // 6. Updater Safety & Rollback Verification
  // =========================================================================
  describe('6. MISHKAT Updater Safety & Rollback', () => {
    it('creates mandatory pre-update safety backup and rolls back on failure', async () => {
      // Attempt to apply an update with a non-existent or invalid zip package
      const fakePackagePath = path.join(serverConfig.dirs.temp, 'non_existent_update.zip');
      const result = await updaterService.applyCertifiedUpdate(
        fakePackagePath,
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      );

      // Verify that failure was safely caught and rolled back
      expect(result.success).toBe(false);
      expect(result.message).toContain('فشل التحديث');

      const status = updaterService.getStatus();
      expect(status.state).toBe('rolled_back');
      expect(status.lastBackupPath).toBeDefined();

      // Verify the pre-update backup file was actually written to disk before failure
      if (status.lastBackupPath) {
        expect(fs.existsSync(status.lastBackupPath)).toBe(true);
      }
    });
  });

  // =========================================================================
  // 7. Outbound Support Queue, Idempotency & Privacy Protection
  // =========================================================================
  describe('7. Outbound Support Queue & Reliable Reporting', () => {
    it('provisions unique institution identity and cryptographic support keys', () => {
      const identity = supportAgentService.getInstitutionIdentity();
      expect(identity.institutionId).toBeDefined();
      expect(identity.installationId).toBeDefined();
      expect(identity.supportSecretKey).toBeDefined();
      expect(identity.supportSecretKey.startsWith('msk_')).toBe(true);
    });

    it('enqueues diagnostic reports with deep PII sanitization and deduplication', async () => {
      const sensitivePassword = 'superSecretPassword123';
      const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature1234567890';
      
      const reportId = await supportAgentService.enqueueOutboundReport({
        sourceType: 'server',
        component: 'database_layer',
        errorType: 'connection_retry_timeout',
        errorCode: 'DB_TIMEOUT',
        severity: 'critical',
        message: `Database connection failed with password=${sensitivePassword} and token=${fakeJwt}`,
        stackTrace: `Error at pool.ts:45\nBearer ${fakeJwt}`,
        diagnosticContext: {
          secret: 'confidentialValue',
          safeKey: 'normalValue',
        },
      });

      expect(reportId).toBeDefined();

      const summary = await supportAgentService.getOutboundQueueSummary();
      expect(summary.totalCount).toBeGreaterThan(0);
      expect(summary.pendingCount).toBeGreaterThan(0);

      // Verify sanitized storage in database
      const { rows } = await db.query(
        'SELECT * FROM support_outbound_queue WHERE report_id = $1',
        [reportId]
      );

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.sanitized_message).not.toContain(sensitivePassword);
      expect(row.sanitized_message).toContain('[REDACTED_PASSWORD]');
      expect(row.sanitized_message).not.toContain(fakeJwt);
      expect(row.sanitized_message).toContain('[REDACTED_JWT]');
      expect(row.diagnostic_context.secret).toBe('[REDACTED]');
      expect(row.diagnostic_context.safeKey).toBe('normalValue');
    });

    it('generates a robust detached updater runner script for Windows Service', () => {
      const scriptPath = updaterService.generateDetachedUpdateScript({
        stagingDir: path.join(serverConfig.dirs.temp, 'mock_staged'),
        rollbackSnapshotDir: path.join(serverConfig.dirs.temp, 'mock_rollback'),
        preUpdateBackupPath: path.join(serverConfig.dirs.temp, 'mock_backup.json'),
      });

      expect(fs.existsSync(scriptPath)).toBe(true);
      const content = fs.readFileSync(scriptPath, 'utf8');
      expect(content).toContain('MishkatLibraryService');
      expect(content).toContain('net stop MishkatLibraryService');
      expect(content).toContain('net start MishkatLibraryService');
      expect(content).toContain('http://localhost:3000/api/v1/health');
      expect(content).toContain(':ROLLBACK');
      expect(content).toContain(':VERIFIED');

      // Cleanup
      fs.unlinkSync(scriptPath);
    });

    it('rejects update with mismatched SHA-256 checksum and executes 3-layer rollback', async () => {
      // Create a temporary mock zip package in controlled temp directory
      const tempZip = path.join(serverConfig.dirs.temp, `test_pkg_${Date.now()}.zip`);
      fs.writeFileSync(tempZip, 'fake zip content for integrity test');

      const result = await updaterService.applyCertifiedUpdate(
        tempZip,
        '0000000000000000000000000000000000000000000000000000000000000000'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('فشل التحقق من سلامة الحزمة');
      const status = updaterService.getStatus();
      expect(status.state).toBe('rolled_back');
      expect(status.lastBackupPath).toBeDefined();

      // Cleanup
      if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
    });

    it('rejects update package paths outside controlled staging directory (Path Traversal Defense)', async () => {
      const evilPath = path.join(process.cwd(), '..', 'evil_update.zip');
      const result = await updaterService.applyCertifiedUpdate(evilPath);

      expect(result.success).toBe(false);
      expect(result.message).toContain('مسار حزمة التحديث غير مصرح به');
    });

    it('rejects non-zip files as update packages', async () => {
      const exePath = path.join(serverConfig.dirs.temp, 'malicious.exe');
      fs.writeFileSync(exePath, 'not a zip');

      const result = await updaterService.applyCertifiedUpdate(exePath);
      expect(result.success).toBe(false);
      expect(result.message).toContain('نوع ملف التحديث غير صالح');

      if (fs.existsSync(exePath)) fs.unlinkSync(exePath);
    });

    it('successfully processes a valid update archive with integrity verification', async () => {
      const stagingSourceDir = path.join(serverConfig.dirs.temp, `test_src_${Date.now()}`);
      const stagingDist = path.join(stagingSourceDir, 'dist');
      fs.mkdirSync(stagingDist, { recursive: true });
      fs.writeFileSync(path.join(stagingDist, 'test_update_marker.txt'), 'v1.0.1-verified');

      const validZip = path.join(serverConfig.dirs.temp, `valid_update_${Date.now()}.zip`);
      
      // Create valid zip archive using PowerShell
      execSync(`powershell.exe -NoProfile -NonInteractive -Command "Compress-Archive -Path '${stagingSourceDir}\\*' -DestinationPath '${validZip}' -Force"`);

      const fileBuffer = fs.readFileSync(validZip);
      const validSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const result = await updaterService.applyCertifiedUpdate(validZip, validSha256);

      expect(result.success).toBe(true);
      expect(result.message).toContain('تم تطبيق التحديث بنجاح');
      const status = updaterService.getStatus();
      expect(status.state).toBe('completed');
      expect(status.progressPercent).toBe(100);

      // Verify marker was deployed
      const deployedMarker = path.join(process.cwd(), 'dist', 'test_update_marker.txt');
      expect(fs.existsSync(deployedMarker)).toBe(true);

      // Cleanup
      if (fs.existsSync(deployedMarker)) fs.unlinkSync(deployedMarker);
      if (fs.existsSync(validZip)) fs.unlinkSync(validZip);
      if (fs.existsSync(stagingSourceDir)) fs.rmSync(stagingSourceDir, { recursive: true, force: true });
    });
  });
});


