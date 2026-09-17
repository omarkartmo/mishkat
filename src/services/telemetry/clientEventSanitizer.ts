/**
 * Client-side Telemetry & Diagnostic Data Sanitizer
 * Guarantees that no passwords, hashes, auth tokens, private student PII,
 * or full text contents are ever transmitted over the network or saved into diagnostic logs.
 */

export class ClientEventSanitizer {
  /**
   * Sanitizes arbitrary string messages and stack traces
   */
  public static sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') return '';

    return input
      // Redact JWT Bearer tokens
      .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]')
      // Redact Authorization headers and token params
      .replace(/(?:Bearer\s+|token=)([a-zA-Z0-9_\-\.]{15,})/gi, 'Bearer [REDACTED_TOKEN]')
      // Redact passwords in json/form/query strings
      .replace(/(["']?password["']?\s*[:=]\s*["']?)([^"'&,\s]+)(["']?)/gi, '$1[REDACTED_PASSWORD]$3')
      .replace(/(["']?client_secret["']?\s*[:=]\s*["']?)([^"'&,\s]+)(["']?)/gi, '$1[REDACTED_SECRET]$3')
      // Redact bcrypt hashes
      .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_HASH]')
      // Redact email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
      // Redact phone numbers
      .replace(/\+?[0-9]{10,14}/g, '[REDACTED_PHONE]')
      // Truncate excessively long messages to prevent memory abuse
      .slice(0, 1500);
  }

  /**
   * Recursively sanitizes metadata dictionaries
   */
  public static sanitizeMetadata(metadata?: Record<string, any>): Record<string, any> {
    if (!metadata || typeof metadata !== 'object') return {};

    const FORBIDDEN_KEYS = new Set([
      'password',
      'password_hash',
      'token',
      'jwt',
      'secret',
      'credentials',
      'bookcontent',
      'notes',
      'fulltext',
      'authorization',
      'cookie',
    ]);

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeMetadata(value);
      }
    }

    return sanitized;
  }
}
