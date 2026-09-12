import { Request, Response, NextFunction } from 'express';

interface AttemptRecord {
  count: number;
  resetTime: number;
}

const loginAttempts = new Map<string, AttemptRecord>();
const MAX_TRACKED_IPS = 10000;

// Periodic cleanup of expired rate limit records to prevent memory leaks
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (now > record.resetTime) {
      loginAttempts.delete(ip);
    }
  }
}, 60 * 1000);
cleanupInterval.unref();

export function getClientIp(req: Request): string {
  // Only trust X-Forwarded-For if Express is explicitly configured with trust proxy
  if (req.app && req.app.get && req.app.get('trust proxy')) {
    return req.ip || req.socket.remoteAddress || '127.0.0.1';
  }
  // Otherwise, use direct socket address to prevent spoofed X-Forwarded-For headers
  return req.socket.remoteAddress || '127.0.0.1';
}

export function authRateLimiter(maxAttempts = 10, windowMs = 15 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-rate-limit'] !== 'true') {
      return next();
    }

    const ip = getClientIp(req);
    const now = Date.now();

    // Prevent Map memory exhaustion attack
    if (loginAttempts.size >= MAX_TRACKED_IPS && !loginAttempts.has(ip)) {
      // Evict expired entries immediately
      for (const [key, record] of loginAttempts.entries()) {
        if (now > record.resetTime) {
          loginAttempts.delete(key);
        }
      }
    }

    const record = loginAttempts.get(ip);
    if (!record || now > record.resetTime) {
      loginAttempts.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= maxAttempts) {
      const waitMinutes = Math.ceil((record.resetTime - now) / 60000);
      return res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: `تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول. يرجى الانتظار لمدة ${waitMinutes} دقيقة والمحاولة مرة أخرى.`,
        },
      });
    }

    record.count += 1;
    next();
  };
}

export function resetAuthAttempts(ip: string) {
  loginAttempts.delete(ip);
}

