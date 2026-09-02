import fs from 'fs';
import path from 'path';
import { serverConfig } from '../config';

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_BACKUP_FILES = 3;

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwtsecret',
  'jwt_secret',
  'authorization',
  'databaseurl',
  'database_url',
  'secret',
  'confirmpassword',
  'cookie',
]);

/**
 * Deeply sanitizes metadata to avoid writing secrets, tokens, or passwords to disk logs.
 */
export function sanitizeLogData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    // Check for bearer tokens in strings
    if (/bearer\s+[a-zA-Z0-9_\-\.]+/i.test(data)) {
      return data.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
    }
    return data;
  }
  if (typeof data !== 'object') return data;
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      ...(process.env.NODE_ENV === 'development' ? { stack: data.stack } : {}),
    };
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item));
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey)) {
      cleaned[key] = '[REDACTED]';
    } else {
      cleaned[key] = sanitizeLogData(value);
    }
  }
  return cleaned;
}

class ProductionLogger {
  private logFilePath: string;
  private logsDir: string;

  constructor() {
    this.logsDir = serverConfig.dirs.logs;
    this.logFilePath = path.join(this.logsDir, 'mishkat.log');
    this.ensureLogDir();
  }

  private ensureLogDir() {
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch {
      // Ignore if cannot create
    }
  }

  private rotateLogsIfNeeded() {
    try {
      if (!fs.existsSync(this.logFilePath)) return;
      const stats = fs.statSync(this.logFilePath);
      if (stats.size < MAX_LOG_SIZE_BYTES) return;

      // Rotate: mishkat.2.log -> mishkat.3.log, mishkat.1.log -> mishkat.2.log, mishkat.log -> mishkat.1.log
      for (let i = MAX_BACKUP_FILES - 1; i >= 1; i--) {
        const currentFile = path.join(this.logsDir, `mishkat.${i}.log`);
        const nextFile = path.join(this.logsDir, `mishkat.${i + 1}.log`);
        if (fs.existsSync(currentFile)) {
          if (fs.existsSync(nextFile)) {
            try { fs.unlinkSync(nextFile); } catch {}
          }
          try { fs.renameSync(currentFile, nextFile); } catch {}
        }
      }

      const backup1 = path.join(this.logsDir, 'mishkat.1.log');
      if (fs.existsSync(backup1)) {
        try { fs.unlinkSync(backup1); } catch {}
      }
      try {
        fs.renameSync(this.logFilePath, backup1);
      } catch {}
    } catch (err: any) {
      console.warn('[Logger] Log rotation warning:', err.message);
    }
  }

  private write(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const sanitizedMeta = meta !== undefined ? sanitizeLogData(meta) : null;
    const metaStr = sanitizedMeta ? ` ${JSON.stringify(sanitizedMeta)}` : '';
    const logLine = `[${timestamp}] [${level}] ${message}${metaStr}\n`;

    // Always mirror to console
    if (level === 'ERROR') {
      console.error(logLine.trim());
    } else if (level === 'WARN') {
      console.warn(logLine.trim());
    } else {
      console.log(logLine.trim());
    }

    // Append to file asynchronously or safely
    try {
      this.ensureLogDir();
      this.rotateLogsIfNeeded();
      fs.appendFileSync(this.logFilePath, logLine, 'utf8');
    } catch {
      // Do not throw if disk log write fails
    }
  }

  public info(message: string, meta?: any) {
    this.write('INFO', message, meta);
  }

  public warn(message: string, meta?: any) {
    this.write('WARN', message, meta);
  }

  public error(message: string, meta?: any) {
    this.write('ERROR', message, meta);
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }
}

export const logger = new ProductionLogger();
