/**
 * Local Offline Queue for Student Telemetry
 * Buffers diagnostic events locally when disconnected from the central server.
 * Automatically retries transmission upon connectivity restoration.
 * Enforces strict capacity limits (max 100 events) to protect client disk space.
 */

import { ClientEventSanitizer } from './clientEventSanitizer';

export interface QueuedTelemetryEvent {
  id: string;
  clientId: string;
  appVersion: string;
  eventType: string;
  severity: 'critical' | 'warning' | 'info';
  errorCode?: string;
  message: string;
  stackTrace?: string;
  route?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

const STORAGE_KEY = 'mishkat_telemetry_offline_queue';
const MAX_QUEUE_SIZE = 100;

export class ClientEventQueue {
  private queue: QueuedTelemetryEvent[] = [];
  private isFlushing = false;

  constructor() {
    this.loadFromStorage();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.flush();
      });
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
          this.queue = JSON.parse(data);
        }
      }
    } catch {
      this.queue = [];
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
      }
    } catch {
      // Quota exceeded: trim queue aggressively
      if (this.queue.length > 20) {
        this.queue = this.queue.slice(-20);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
        } catch {}
      }
    }
  }

  /**
   * Enqueues an event, enforcing sanitization and queue capacity
   */
  public enqueue(rawEvent: Omit<QueuedTelemetryEvent, 'id' | 'timestamp'>): void {
    const event: QueuedTelemetryEvent = {
      ...rawEvent,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      message: ClientEventSanitizer.sanitizeString(rawEvent.message),
      stackTrace: rawEvent.stackTrace ? ClientEventSanitizer.sanitizeString(rawEvent.stackTrace) : undefined,
      metadata: ClientEventSanitizer.sanitizeMetadata(rawEvent.metadata),
      timestamp: new Date().toISOString(),
    };

    this.queue.push(event);

    // Bound maximum queue size: discard oldest events on overflow
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }

    this.saveToStorage();

    // Trigger asynchronous flush attempt
    this.flush();
  }

  /**
   * Flushes buffered events to the server API
   */
  public async flush(serverBaseUrl = ''): Promise<{ sentCount: number }> {
    if (this.isFlushing || this.queue.length === 0) {
      return { sentCount: 0 };
    }

    this.isFlushing = true;
    const batch = [...this.queue];

    try {
      const url = `${serverBaseUrl}/api/v1/client-events`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });

      if (res.ok) {
        // Remove sent items from queue
        const sentIds = new Set(batch.map((e) => e.id));
        this.queue = this.queue.filter((e) => !sentIds.has(e.id));
        this.saveToStorage();
        return { sentCount: batch.length };
      }
    } catch {
      // Server unreachable or offline: events remain safely queued
    } finally {
      this.isFlushing = false;
    }

    return { sentCount: 0 };
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public clear(): void {
    this.queue = [];
    this.saveToStorage();
  }
}

export const clientEventQueue = new ClientEventQueue();
