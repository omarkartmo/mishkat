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
}

export const supportAgentService = SupportAgentService.getInstance();
