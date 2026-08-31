import { Request, Response, NextFunction } from 'express';

interface AttemptRecord {
  count: number;
  resetTime: number;
}

const loginAttempts = new Map<string, AttemptRecord>();

export function authRateLimiter(maxAttempts = 10, windowMs = 15 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
    const now = Date.now();

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
