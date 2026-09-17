/**
 * Student Station Telemetry Service
 * Automatically captures crashes, unhandled rejections, reader rendering failures,
 * whitelist violations, and manual user problem reports.
 */

import { clientEventQueue } from './clientEventQueue';

export interface TelemetryConfig {
  appVersion: string;
  serverBaseUrl: string;
}

class TelemetryService {
  private static instance: TelemetryService | null = null;
  private clientId: string = '';
  private appVersion: string = '1.0.0';
  private serverBaseUrl: string = '';
  private isInitialized = false;
  private heartbeatInterval: any = null;

  private constructor() {
    this.clientId = this.getOrCreateClientId();
  }

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  private getOrCreateClientId(): string {
    if (typeof localStorage === 'undefined') return 'student-unknown';
    let id = localStorage.getItem('mishkat_student_client_id');
    if (!id) {
      id = `stu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('mishkat_student_client_id', id);
    }
    return id;
  }

  public getClientId(): string {
    return this.clientId;
  }

  public init(config?: Partial<TelemetryConfig>): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (config?.appVersion) this.appVersion = config.appVersion;
    if (config?.serverBaseUrl) this.serverBaseUrl = config.serverBaseUrl;

    if (typeof window !== 'undefined') {
      // 1. Global unhandled JavaScript errors
      window.addEventListener('error', (event) => {
        this.reportError('react_error', 'WINDOW_ERROR', event.error || event.message, {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        });
      });

      // 2. Global unhandled Promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        this.reportError('crash', 'UNHANDLED_PROMISE_REJECTION', event.reason, {
          reason: String(event.reason),
        });
      });

      // 3. Heartbeat every 3 minutes
      this.sendHeartbeat();
      this.heartbeatInterval = setInterval(() => {
        this.sendHeartbeat();
      }, 3 * 60 * 1000);
    }
  }

  private sendHeartbeat(): void {
    const payload = {
      clientId: this.clientId,
      machineName: (typeof navigator !== 'undefined' && navigator.userAgent) ? 'Student Station' : 'Unknown',
      appVersion: this.appVersion,
      osVersion: (typeof navigator !== 'undefined' && navigator.platform) ? navigator.platform : 'Windows',
    };

    fetch(`${this.serverBaseUrl}/api/v1/client-events/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silent on connection failure
    });
  }

  /**
   * Generic error reporter
   */
  public reportError(
    eventType: string,
    errorCode: string,
    error: any,
    metadata?: Record<string, any>,
    severity: 'critical' | 'warning' | 'info' = 'warning'
  ): void {
    let message = 'Unknown client error';
    let stackTrace: string | undefined;

    if (error instanceof Error) {
      message = error.message;
      stackTrace = error.stack;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object') {
      message = error.message || JSON.stringify(error);
    }

    clientEventQueue.enqueue({
      clientId: this.clientId,
      appVersion: this.appVersion,
      eventType,
      severity,
      errorCode,
      message,
      stackTrace,
      route: typeof window !== 'undefined' ? window.location.pathname : '',
      metadata,
    });
  }

  /**
   * Specialized reporter for PDF/EPUB rendering failures
   */
  public reportReaderError(format: 'pdf' | 'epub', bookTitle: string, error: any): void {
    this.reportError(
      `${format}_render_error`,
      `${format.toUpperCase()}_RENDER_FAILED`,
      error,
      { bookTitle },
      'warning'
    );
  }

  /**
   * Specialized reporter for blocked unapproved websites
   */
  public reportWhitelistBlock(blockedUrl: string): void {
    this.reportError(
      'whitelist_blocked',
      'UNAPPROVED_DOMAIN_BLOCKED',
      `Blocked unauthorized navigation attempt to: ${blockedUrl}`,
      { blockedUrl },
      'info'
    );
  }

  /**
   * Manual problem report from student ("Report a problem")
   */
  public reportManualProblem(screen: string, userNote: string): void {
    this.reportError(
      'manual_report',
      'USER_REPORTED_PROBLEM',
      userNote || 'Student submitted feedback',
      { screen },
      'info'
    );
  }

  /**
   * Network timeout / server unreachable reporter
   */
  public reportNetworkTimeout(url: string, error: any): void {
    this.reportError(
      'network_timeout',
      'SERVER_UNREACHABLE',
      error,
      { targetUrl: url },
      'critical'
    );
  }
}

export const telemetryService = TelemetryService.getInstance();
