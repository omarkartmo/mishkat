/**
 * Security & Penetration Defense Utilities
 * - Anti-XSS Input Sanitization
 * - Strict URL Protocol & Scheme Validation
 * - Brute-Force Rate Limiting & Lockout Defense
 * - Prototype & Object Pollution Defense
 */

// Rate limiting state tracker (in-memory per session)
interface RateLimitRecord {
  failedAttempts: number;
  lockoutUntil: number; // timestamp in ms
  lastAttempt: number;
}

const rateLimitStore: Record<string, RateLimitRecord> = {};

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000; // 60 seconds lockout

/**
 * Validates and checks whether an identifier (e.g. username/IP) is currently rate-limited.
 */
export function checkRateLimit(identifier: string): { isLocked: boolean; remainingSeconds: number; attemptsLeft: number } {
  const cleanId = identifier.trim().toLowerCase();
  const record = rateLimitStore[cleanId];
  const now = Date.now();

  if (!record) {
    return { isLocked: false, remainingSeconds: 0, attemptsLeft: MAX_FAILED_ATTEMPTS };
  }

  if (record.lockoutUntil > now) {
    const remainingSeconds = Math.ceil((record.lockoutUntil - now) / 1000);
    return { isLocked: true, remainingSeconds, attemptsLeft: 0 };
  }

  // If lockout expired, reset attempts
  if (record.lockoutUntil > 0 && record.lockoutUntil <= now) {
    record.failedAttempts = 0;
    record.lockoutUntil = 0;
  }

  const attemptsLeft = Math.max(0, MAX_FAILED_ATTEMPTS - record.failedAttempts);
  return { isLocked: false, remainingSeconds: 0, attemptsLeft };
}

/**
 * Records a failed login attempt and applies progressive lockout if threshold reached.
 */
export function recordFailedAttempt(identifier: string): { isNowLocked: boolean; remainingSeconds: number; attemptsLeft: number } {
  const cleanId = identifier.trim().toLowerCase();
  const now = Date.now();
  
  if (!rateLimitStore[cleanId]) {
    rateLimitStore[cleanId] = {
      failedAttempts: 1,
      lockoutUntil: 0,
      lastAttempt: now,
    };
  } else {
    rateLimitStore[cleanId].failedAttempts += 1;
    rateLimitStore[cleanId].lastAttempt = now;
  }

  const record = rateLimitStore[cleanId];

  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    record.lockoutUntil = now + LOCKOUT_DURATION_MS;
    return { isNowLocked: true, remainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000), attemptsLeft: 0 };
  }

  const attemptsLeft = MAX_FAILED_ATTEMPTS - record.failedAttempts;
  return { isNowLocked: false, remainingSeconds: 0, attemptsLeft };
}

/**
 * Resets rate limit tracker on successful authentication.
 */
export function resetRateLimit(identifier: string): void {
  const cleanId = identifier.trim().toLowerCase();
  delete rateLimitStore[cleanId];
}

/**
 * Sanitizes arbitrary string input to neutralize script injection, HTML tags, and dangerous entities.
 */
export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  
  return input
    // Strip script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Strip iframe/embed/object
    .replace(/<(?:iframe|embed|object|base|meta)\b[^>]*>/gi, '')
    // Strip inline event handlers like onerror, onclick, onload
    .replace(/on\w+\s*=\s*(?:["'][^"']*["']|[^\s>]+)/gi, '')
    // Strip javascript: pseudo-protocol
    .replace(/javascript\s*:/gi, '')
    // Strip data: pseudo-protocol for executable scripts
    .replace(/data\s*:\s*text\/html/gi, '')
    // Strip angle brackets
    .replace(/[<>]/g, '')
    // Normalize null bytes and trim
    .replace(/\0/g, '')
    .trim();
}

/**
 * Strict URL validator. Only permits valid http:// and https:// URLs.
 * Rejects javascript:, data:, file:, blob:, vbscript:, etc.
 */
export function isSafeUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  
  const trimmed = url.trim().toLowerCase();
  
  // Explicitly reject dangerous schemes
  const forbiddenSchemes = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:'];
  for (const scheme of forbiddenSchemes) {
    if (trimmed.startsWith(scheme)) return false;
  }

  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    // Relative safe URLs if applicable
    if (url.startsWith('/') && !url.startsWith('//')) {
      return true;
    }
    return false;
  }
}

/**
 * Sanitizes an object deeply to prevent prototype pollution and nested injection vectors.
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return sanitizeText(obj) as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as unknown as T;
  }

  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    // Prevent Prototype Pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const val = (obj as any)[key];
    result[key] = typeof val === 'string' ? sanitizeText(val) : sanitizeObject(val);
  }

  return result as T;
}
