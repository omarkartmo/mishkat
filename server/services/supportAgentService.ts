import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { db } from '../db/pool';
import { serverConfig } from '../config';
import { listLocalBackups } from './backupService';
import { googleDriveService } from './googleDriveService';

export interface ClientRegistrationInput {
  clientId: string;
  machineName?: string;
  appVersion: string;
  osVersion?: string;
}

export interface ClientTelemetryEventInput {
  id?: string;
  clientId: string;
  appVersion: string;
  eventType: 'crash' | 'react_error' | 'pdf_render_error' | 'epub_render_error' | 'network_timeout' | 'whitelist_blocked' | 'manual_report' | string;
  severity: 'critical' | 'warning' | 'info';
  errorCode?: string;
  message: string;
  stackTrace?: string;
  route?: string;
  metadata?: Record<string, any>;
  timestamp?: string;
}

export interface AggregatedErrorItem {
  signature: string;
  eventType: string;
  errorCode: string;
  severity: 'critical' | 'warning' | 'info';
  occurrenceCount: number;
  affectedClientsCount: number;
  affectedClientIds: string[];
  affectedAppVersions: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  sampleMessage: string;
  sampleStackTrace?: string;
  recentRoute?: string;
}

export interface ServerHealthMetrics {
  status: 'healthy' | 'degraded' | 'critical';
  service: {
    name: string;
    uptimeSeconds: number;
    memoryUsageMb: number;
    pid: number;
    nodeVersion: string;
    platform: string;
  };
  database: {
    status: 'connected' | 'error';
    engine: string;
    latencyMs: number;
    tableCounts: {
      books: number;
      users: number;
      activeLoans: number;
      telemetryEvents: number;
    };
  };
  storage: {
    libraryDataPath: string;
    libraryDataSizeMb: number;
    diskFreeSpaceMb: number;
    diskTotalSpaceMb: number;
    isWritable: boolean;
  };
  backups: {
    localBackupsCount: number;
    latestLocalBackupTime: string | null;
    googleDriveConnected: boolean;
    googleDriveAccount: string | null;
    latestCloudBackupTime: string | null;
    retentionPolicy: string;
  };
}

export class SupportAgentService {
  private static instance: SupportAgentService | null = null;
  private startTime = Date.now();

  private constructor() {}

  public static getInstance(): SupportAgentService {
    if (!SupportAgentService.instance) {
      SupportAgentService.instance = new SupportAgentService();
    }
    return SupportAgentService.instance;
  }

  /**
   * Deep sanitization of string inputs: redacts passwords, tokens, hashes, emails, PII
   */
  public sanitizeText(text: string): string {
    if (!text || typeof text !== 'string') return '';

    return text
      // Redact JWT tokens
      .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]')
      // Redact Authorization headers and bearer tokens
      .replace(/(?:Bearer\s+|token=)([a-zA-Z0-9_\-\.]{15,})/gi, 'Bearer [REDACTED_TOKEN]')
      // Redact passwords in json/form/query strings
      .replace(/(["']?password["']?\s*[:=]\s*["']?)([^"'&,\s]+)(["']?)/gi, '$1[REDACTED_PASSWORD]$3')
      .replace(/(["']?client_secret["']?\s*[:=]\s*["']?)([^"'&,\s]+)(["']?)/gi, '$1[REDACTED_SECRET]$3')
      // Redact bcrypt password hashes
      .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_HASH]')
      // Redact email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
      // Redact phone numbers (international/local formats)
      .replace(/\+?[0-9]{10,14}/g, '[REDACTED_PHONE]')
      // Trim excessive length
      .slice(0, 2000);
  }

  /**
   * Sanitizes metadata objects before persistence
   */
  public sanitizeMetadata(metadata?: Record<string, any>): Record<string, any> {
    if (!metadata || typeof metadata !== 'object') return {};

    const sanitized: Record<string, any> = {};
    const FORBIDDEN_KEYS = new Set(['password', 'password_hash', 'token', 'jwt', 'secret', 'credentials', 'bookContent', 'notes']);

    for (const [key, value] of Object.entries(metadata)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeText(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeMetadata(value);
      }
    }

    return sanitized;
  }

  /**
   * Records or updates a student client station heartbeat
   */
  public async recordClientHeartbeat(client: ClientRegistrationInput, ipAddress = ''): Promise<void> {
    const cleanClientId = (client.clientId || '').trim().slice(0, 100);
    if (!cleanClientId) return;

    const machineName = this.sanitizeText(client.machineName || 'Unknown Machine').slice(0, 150);
    const appVersion = (client.appVersion || '1.0.0').slice(0, 50);
    const osVersion = (client.osVersion || os.type()).slice(0, 100);
    const cleanIp = (ipAddress || '').replace(/^::ffff:/, '').slice(0, 50);

    await db.query(
      `INSERT INTO connected_clients (client_id, machine_name, app_version, os_version, ip_address, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (client_id) DO UPDATE
       SET machine_name = EXCLUDED.machine_name,
           app_version = EXCLUDED.app_version,
           os_version = EXCLUDED.os_version,
           ip_address = EXCLUDED.ip_address,
           last_seen_at = CURRENT_TIMESTAMP`,
      [cleanClientId, machineName, appVersion, osVersion, cleanIp]
    );
  }

  /**
   * Ingests single or batched telemetry events from student stations
   */
  public async ingestClientEvents(events: ClientTelemetryEventInput[], clientIp = ''): Promise<{ ingestedCount: number }> {
    if (!Array.isArray(events) || events.length === 0) {
      return { ingestedCount: 0 };
    }

    let ingested = 0;

    for (const ev of events) {
      const clientId = (ev.clientId || '').trim().slice(0, 100);
      if (!clientId) continue;

      // Ensure client record exists
      await this.recordClientHeartbeat({
        clientId,
        appVersion: ev.appVersion || '1.0.0',
      }, clientIp);

      const eventId = ev.id || `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const eventType = (ev.eventType || 'unknown').toLowerCase().slice(0, 50);
      const severity = ['critical', 'warning', 'info'].includes(ev.severity) ? ev.severity : 'warning';
      const errorCode = (ev.errorCode || 'UNKNOWN_ERROR').toUpperCase().slice(0, 100);
      const sanitizedMessage = this.sanitizeText(ev.message || 'No error message provided');
      const sanitizedStack = ev.stackTrace ? this.sanitizeText(ev.stackTrace).slice(0, 4000) : null;
      const sanitizedRoute = (ev.route || '').slice(0, 200);
      const sanitizedMeta = JSON.stringify(this.sanitizeMetadata(ev.metadata));

      await db.query(
        `INSERT INTO client_telemetry_events (
           id, client_id, app_version, event_type, severity, error_code,
           message_sanitized, stack_trace_sanitized, route, metadata, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, CURRENT_TIMESTAMP)`,
        [
          eventId,
          clientId,
          ev.appVersion || '1.0.0',
          eventType,
          severity,
          errorCode,
          sanitizedMessage,
          sanitizedStack,
          sanitizedRoute,
          sanitizedMeta,
        ]
      );

      // If event is critical, a crash, or a manual user/student report, forward to developer outbound queue
      if (eventType === 'manual_report' || eventType === 'crash' || severity === 'critical') {
        this.enqueueOutboundReport({
          sourceType: 'client',
          clientDeviceId: clientId,
          userRole: eventType === 'manual_report' ? 'student' : 'client_station',
          component: sanitizedRoute || 'client_station',
          errorType: eventType,
          errorCode,
          severity: severity as 'critical' | 'warning' | 'info',
          message: sanitizedMessage,
          stackTrace: sanitizedStack || undefined,
          diagnosticContext: {
            clientId,
            appVersion: ev.appVersion || '1.0.0',
            route: sanitizedRoute,
            ...this.sanitizeMetadata(ev.metadata),
          },
        }).catch((err) => {
          console.warn('⚠️ [SupportAgent] Outbound forwarding notice:', err.message);
        });
      }

      ingested++;
    }

    // Opportunistically prune oldest events if table exceeds 5,000 items
    this.pruneOldEvents().catch((err) => {
      console.warn('⚠️ [SupportAgent] Event pruning notice:', err.message);
    });

    return { ingestedCount: ingested };
  }

  /**
   * Prunes events older than 30 days or keeps recent 5,000 events max
   */
  private async pruneOldEvents(): Promise<void> {
    await db.query(`
      DELETE FROM client_telemetry_events
      WHERE created_at < NOW() - INTERVAL '30 days'
         OR id NOT IN (
           SELECT id FROM client_telemetry_events
           ORDER BY created_at DESC
           LIMIT 5000
         )
    `);
  }

  /**
   * Calculates size of a directory recursively in megabytes
   */
  private calculateDirectorySizeMb(dirPath: string): number {
    try {
      if (!fs.existsSync(dirPath)) return 0;
      let totalBytes = 0;

      const walk = (p: string) => {
        const stats = fs.statSync(p);
        if (stats.isDirectory()) {
          const entries = fs.readdirSync(p);
          for (const entry of entries) {
            walk(path.join(p, entry));
          }
        } else {
          totalBytes += stats.size;
        }
      };

      walk(dirPath);
      return Math.round((totalBytes / (1024 * 1024)) * 10) / 10;
    } catch {
      return 0;
    }
  }

  /**
   * Retrieves disk free space in MB safely
   */
  private getDiskSpaceMb(targetPath: string): { freeMb: number; totalMb: number } {
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(targetPath);
        const freeMb = Math.round((stats.bavail * stats.bsize) / (1024 * 1024));
        const totalMb = Math.round((stats.blocks * stats.bsize) / (1024 * 1024));
        return { freeMb, totalMb };
      }
    } catch {
      // Fallback if statfsSync is not available on specific OS target
    }
    return { freeMb: 10240, totalMb: 51200 }; // Sensible defaults
  }

  /**
   * Comprehensive Server Health inspection
   */
  public async getServerHealth(): Promise<ServerHealthMetrics> {
    const startPing = Date.now();
    let dbStatus: 'connected' | 'error' = 'connected';
    let latencyMs = 0;
    const tableCounts = { books: 0, users: 0, activeLoans: 0, telemetryEvents: 0 };

    try {
      const pingRes = await db.query('SELECT 1');
      latencyMs = Date.now() - startPing;

      const [booksCount, usersCount, loansCount, telemetryCount] = await Promise.all([
        db.query('SELECT COUNT(*)::int as c FROM books'),
        db.query('SELECT COUNT(*)::int as c FROM users'),
        db.query("SELECT COUNT(*)::int as c FROM loans WHERE status = 'active'"),
        db.query('SELECT COUNT(*)::int as c FROM client_telemetry_events'),
      ]);

      tableCounts.books = booksCount.rows[0]?.c || 0;
      tableCounts.users = usersCount.rows[0]?.c || 0;
      tableCounts.activeLoans = loansCount.rows[0]?.c || 0;
      tableCounts.telemetryEvents = telemetryCount.rows[0]?.c || 0;
    } catch (err) {
      dbStatus = 'error';
      latencyMs = Date.now() - startPing;
    }

    // Storage Metrics
    const libraryDataPath = serverConfig.dirs.root;
    const libraryDataSizeMb = this.calculateDirectorySizeMb(libraryDataPath);
    const { freeMb, totalMb } = this.getDiskSpaceMb(libraryDataPath);

    let isWritable = false;
    try {
      const testFile = path.join(serverConfig.dirs.temp, `.health_write_${Date.now()}`);
      fs.writeFileSync(testFile, 'ok', 'utf8');
      fs.unlinkSync(testFile);
      isWritable = true;
    } catch {
      isWritable = false;
    }

    // Backup Metrics
    const localBackups = listLocalBackups();
    const driveStatus = await googleDriveService.getConnectionStatus();

    let systemStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (dbStatus === 'error' || !isWritable || freeMb < 500) {
      systemStatus = 'critical';
    } else if (localBackups.length === 0 || freeMb < 2000) {
      systemStatus = 'degraded';
    }

    return {
      status: systemStatus,
      service: {
        name: 'MishkatLibraryService',
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
        memoryUsageMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
        pid: process.pid,
        nodeVersion: process.version,
        platform: `${os.type()} ${os.release()} (${os.arch()})`,
      },
      database: {
        status: dbStatus,
        engine: 'Embedded PostgreSQL (PGlite)',
        latencyMs,
        tableCounts,
      },
      storage: {
        libraryDataPath,
        libraryDataSizeMb,
        diskFreeSpaceMb: freeMb,
        diskTotalSpaceMb: totalMb,
        isWritable,
      },
      backups: {
        localBackupsCount: localBackups.length,
        latestLocalBackupTime: localBackups[0]?.createdAt || null,
        googleDriveConnected: driveStatus.connected,
        googleDriveAccount: driveStatus.email || null,
        latestCloudBackupTime: null,
        retentionPolicy: '7-version local + 7-version Google Drive',
      },
    };
  }

  /**
   * Connected student clients statistics & active list
   */
  public async getConnectedClientsSummary(): Promise<{
    connectedNowCount: number;
    seenTodayCount: number;
    totalRegisteredCount: number;
    clients: Array<{
      clientId: string;
      machineName: string;
      appVersion: string;
      osVersion: string;
      ipAddress: string;
      lastSeenAt: string;
      isOnline: boolean;
      todayErrorsCount: number;
    }>;
  }> {
    // 5 minutes threshold for online indicator
    const { rows } = await db.query(`
      SELECT 
        c.client_id,
        c.machine_name,
        c.app_version,
        c.os_version,
        c.ip_address,
        c.last_seen_at,
        (c.last_seen_at >= NOW() - INTERVAL '5 minutes') as is_online,
        COALESCE(e.today_errors, 0) as today_errors_count
      FROM connected_clients c
      LEFT JOIN (
        SELECT client_id, COUNT(*) as today_errors
        FROM client_telemetry_events
        WHERE created_at >= DATE_TRUNC('day', CURRENT_TIMESTAMP)
        GROUP BY client_id
      ) e ON c.client_id = e.client_id
      ORDER BY c.last_seen_at DESC
    `);

    const clients = rows.map((r) => ({
      clientId: r.client_id,
      machineName: r.machine_name || 'حاسوب طالب',
      appVersion: r.app_version,
      osVersion: r.os_version || 'Windows',
      ipAddress: r.ip_address || '-',
      lastSeenAt: r.last_seen_at,
      isOnline: Boolean(r.is_online),
      todayErrorsCount: Number(r.today_errors_count) || 0,
    }));

    const connectedNowCount = clients.filter((c) => c.isOnline).length;
    const seenTodayCount = clients.filter((c) => {
      const lastSeen = new Date(c.lastSeenAt).getTime();
      const startOfDay = new Date().setHours(0, 0, 0, 0);
      return lastSeen >= startOfDay;
    }).length;

    return {
      connectedNowCount,
      seenTodayCount,
      totalRegisteredCount: clients.length,
      clients,
    };
  }

  /**
   * Intelligent Error Aggregation
   * Groups recurring errors by event_type + error_code into unified signatures
   */
  public async getAggregatedErrors(limit = 50): Promise<AggregatedErrorItem[]> {
    const { rows } = await db.query(`
      SELECT 
        event_type,
        error_code,
        MAX(severity) as max_severity,
        COUNT(*)::int as occurrence_count,
        COUNT(DISTINCT client_id)::int as affected_clients_count,
        ARRAY_AGG(DISTINCT client_id) as affected_client_ids,
        ARRAY_AGG(DISTINCT app_version) as affected_app_versions,
        MIN(created_at) as first_seen_at,
        MAX(created_at) as last_seen_at,
        (ARRAY_AGG(message_sanitized ORDER BY created_at DESC))[1] as sample_message,
        (ARRAY_AGG(stack_trace_sanitized ORDER BY created_at DESC) FILTER (WHERE stack_trace_sanitized IS NOT NULL))[1] as sample_stack,
        (ARRAY_AGG(route ORDER BY created_at DESC) FILTER (WHERE route IS NOT NULL AND route != ''))[1] as recent_route
      FROM client_telemetry_events
      GROUP BY event_type, error_code
      ORDER BY occurrence_count DESC, last_seen_at DESC
      LIMIT $1
    `, [limit]);

    return rows.map((r) => {
      const eventType = r.event_type || 'error';
      const errorCode = r.error_code || 'UNKNOWN';
      const signature = `${errorCode} (${eventType})`;

      // Normalize severity
      let severity: 'critical' | 'warning' | 'info' = 'warning';
      if (r.max_severity === 'critical') severity = 'critical';
      else if (r.max_severity === 'info') severity = 'info';

      return {
        signature,
        eventType,
        errorCode,
        severity,
        occurrenceCount: Number(r.occurrence_count),
        affectedClientsCount: Number(r.affected_clients_count),
        affectedClientIds: (r.affected_client_ids || []).slice(0, 20),
        affectedAppVersions: r.affected_app_versions || [],
        firstSeenAt: r.first_seen_at,
        lastSeenAt: r.last_seen_at,
        sampleMessage: r.sample_message || 'No details',
        sampleStackTrace: r.sample_stack || undefined,
        recentRoute: r.recent_route || undefined,
      };
    });
  }

  /**
   * Fetches recent raw events for drill-down investigation
   */
  public async getRecentEvents(limit = 100): Promise<any[]> {
    const { rows } = await db.query(`
      SELECT 
        e.id,
        e.client_id,
        c.machine_name,
        e.app_version,
        e.event_type,
        e.severity,
        e.error_code,
        e.message_sanitized,
        e.stack_trace_sanitized,
        e.route,
        e.metadata,
        e.created_at
      FROM client_telemetry_events e
      LEFT JOIN connected_clients c ON e.client_id = c.client_id
      ORDER BY e.created_at DESC
      LIMIT $1
    `, [limit]);

    return rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      machineName: r.machine_name || 'Student PC',
      appVersion: r.app_version,
      eventType: r.event_type,
      severity: r.severity,
      errorCode: r.error_code,
      message: r.message_sanitized,
      stackTrace: r.stack_trace_sanitized,
      route: r.route,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  }

  /**
   * Retrieves or provisions unique institution identity & cryptographic support credentials
   */
  public getInstitutionIdentity(): { institutionId: string; installationId: string; supportSecretKey: string } {
    const secretsDir = path.join(serverConfig.dirs.root, 'secrets');
    const identityFile = path.join(secretsDir, 'institution.json');

    try {
      if (fs.existsSync(identityFile)) {
        return JSON.parse(fs.readFileSync(identityFile, 'utf8'));
      }
    } catch {}

    // First-time provisioning
    if (!fs.existsSync(secretsDir)) {
      fs.mkdirSync(secretsDir, { recursive: true });
    }

    const newIdentity = {
      institutionId: process.env.MISHKAT_INSTITUTION_ID || 'INST-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
      installationId: 'INS-' + crypto.randomBytes(8).toString('hex'),
      supportSecretKey: 'msk_' + crypto.randomBytes(24).toString('hex'),
    };

    try {
      fs.writeFileSync(identityFile, JSON.stringify(newIdentity, null, 2), 'utf8');
    } catch (e: any) {
      console.warn('⚠️ [SupportAgent] Could not write institution identity:', e.message);
    }

    return newIdentity;
  }

  /**
   * Enqueues an error or diagnostic report into the persistent outbound queue
   */
  public async enqueueOutboundReport(report: {
    reportId?: string;
    sourceType?: 'client' | 'server';
    clientDeviceId?: string;
    userRole?: string;
    component: string;
    errorType: string;
    errorCode: string;
    severity?: 'critical' | 'warning' | 'info';
    message: string;
    stackTrace?: string;
    diagnosticContext?: Record<string, any>;
  }): Promise<string> {
    const identity = this.getInstitutionIdentity();
    const reportId = report.reportId || `rep_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const sourceType = report.sourceType || 'server';
    const severity = report.severity || 'warning';
    const sanitizedMsg = this.sanitizeText(report.message);
    const sanitizedStack = report.stackTrace ? this.sanitizeText(report.stackTrace).slice(0, 4000) : null;
    const sanitizedContext = JSON.stringify(this.sanitizeMetadata(report.diagnosticContext));

    const appVersion = (process.env.npm_package_version || '1.0.0').slice(0, 50);

    try {
      await db.query(
        `INSERT INTO support_outbound_queue (
           report_id, institution_id, installation_id, app_version,
           source_type, client_device_id, user_role, component,
           error_type, error_code, severity, sanitized_message,
           sanitized_stack_trace, diagnostic_context, status, next_retry_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, 'pending', CURRENT_TIMESTAMP)
         ON CONFLICT (report_id) DO NOTHING`,
        [
          reportId,
          identity.institutionId,
          identity.installationId,
          appVersion,
          sourceType,
          report.clientDeviceId || null,
          report.userRole || 'system',
          report.component,
          report.errorType,
          report.errorCode,
          severity,
          sanitizedMsg,
          sanitizedStack,
          sanitizedContext,
        ]
      );
    } catch (err: any) {
      console.warn('⚠️ [SupportAgent] Enqueue outbound report notice:', err.message);
    }

    // Trigger opportunistic background delivery to developer support hub in non-test mode
    if (process.env.NODE_ENV !== 'test') {
      this.flushOutboundQueue().catch(() => {});
    }

    return reportId;
  }

  private outboundFlushTimer: any = null;

  /**
   * Starts periodic background worker to retry delivery of queued support reports
   */
  public startOutboundQueueWorker(intervalMs: number = 60000): void {
    if (this.outboundFlushTimer) return;
    this.outboundFlushTimer = setInterval(() => {
      this.flushOutboundQueue().catch(() => {});
    }, intervalMs);
    if (this.outboundFlushTimer && typeof this.outboundFlushTimer.unref === 'function') {
      this.outboundFlushTimer.unref();
    }
  }

  /**
   * Flushes pending reports from outbound queue to the Developer Support API
   * Applies Exponential Backoff, Idempotent Delivery, and ACK verification.
   */
  public async flushOutboundQueue(apiEndpoint?: string, forceRetry = false): Promise<{ sent: number; failed: number }> {
    const targetUrl = apiEndpoint || process.env.MISHKAT_SUPPORT_API_URL || 'http://127.0.0.1:4000/api/v1/support/reports';
    if (!targetUrl) {
      // Offline / Developer endpoint not configured: reports remain safely queued on disk
      return { sent: 0, failed: 0 };
    }

    const identity = this.getInstitutionIdentity();

    // Fetch up to 20 pending or retryable reports
    const whereClause = (forceRetry || apiEndpoint)
      ? "(status = 'pending' OR status = 'failed' OR status = 'sending')"
      : "(status = 'pending' OR (status = 'failed' AND next_retry_at <= CURRENT_TIMESTAMP) OR (status = 'sending' AND last_attempt_at < CURRENT_TIMESTAMP - INTERVAL '1 minute'))";

    const { rows } = await db.query(`
      SELECT * FROM support_outbound_queue
      WHERE ${whereClause}
      ORDER BY created_at ASC
      LIMIT 20
    `);

    if (rows.length === 0) {
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      // Mark as sending
      await db.query(
        `UPDATE support_outbound_queue SET status = 'sending', last_attempt_at = CURRENT_TIMESTAMP, attempts_count = attempts_count + 1 WHERE report_id = $1`,
        [row.report_id]
      );

      try {
        const payload = {
          reportId: row.report_id,
          institutionId: row.institution_id,
          installationId: row.installation_id,
          appVersion: row.app_version,
          sourceType: row.source_type,
          clientDeviceId: row.client_device_id,
          userRole: row.user_role,
          component: row.component,
          errorType: row.error_type,
          errorCode: row.error_code,
          severity: row.severity,
          sanitizedMessage: row.sanitized_message,
          sanitizedStackTrace: row.sanitized_stack_trace,
          diagnosticContext: row.diagnostic_context,
          timestamp: row.created_at,
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Institution-Id': identity.institutionId,
            'X-Installation-Id': identity.installationId,
            'X-Support-Key': identity.supportSecretKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        let ackData: any = null;
        try {
          ackData = await res.json();
        } catch {}

        if (res.ok && ackData && ackData.acknowledged === true) {
          await db.query(
            `UPDATE support_outbound_queue SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE report_id = $1`,
            [row.report_id]
          );
          sent++;
        } else {
          const errMsg = ackData?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
          throw new Error(`Support API rejected report: ${errMsg}`);
        }
      } catch (err: any) {
        failed++;
        // Calculate exponential backoff delay: 1m, 5m, 15m, 30m, 60m
        const attempts = Number(row.attempts_count) + 1;
        const delaysMinutes = [1, 5, 15, 30, 60];
        const delay = delaysMinutes[Math.min(attempts - 1, delaysMinutes.length - 1)];

        await db.query(
          `UPDATE support_outbound_queue 
           SET status = 'failed', 
               next_retry_at = CURRENT_TIMESTAMP + INTERVAL '${delay} minutes' 
           WHERE report_id = $1`,
          [row.report_id]
        );
      }
    }

    // Opportunistically prune sent reports older than 14 days
    await db.query(`
      DELETE FROM support_outbound_queue 
      WHERE status = 'sent' AND sent_at < NOW() - INTERVAL '14 days'
    `).catch(() => {});

    return { sent, failed };
  }

  /**
   * Returns outbound support queue metrics
   */
  public async getOutboundQueueSummary(): Promise<{
    pendingCount: number;
    sentCount: number;
    failedCount: number;
    totalCount: number;
  }> {
    try {
      const { rows } = await db.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'pending')::int as pending_count,
          COUNT(*) FILTER (WHERE status = 'sent')::int as sent_count,
          COUNT(*) FILTER (WHERE status = 'failed')::int as failed_count,
          COUNT(*)::int as total_count
        FROM support_outbound_queue
      `);

      return {
        pendingCount: rows[0]?.pending_count || 0,
        sentCount: rows[0]?.sent_count || 0,
        failedCount: rows[0]?.failed_count || 0,
        totalCount: rows[0]?.total_count || 0,
      };
    } catch {
      return { pendingCount: 0, sentCount: 0, failedCount: 0, totalCount: 0 };
    }
  }
}

export const supportAgentService = SupportAgentService.getInstance();

