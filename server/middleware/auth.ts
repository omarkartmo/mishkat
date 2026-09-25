import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { serverConfig } from '../config';
import { db } from '../db/pool';

export interface AuthUser {
  id: string;
  name: string;
  registrationNumber: string;
  role: 'admin' | 'librarian' | 'student';
  grade?: string;
  email?: string;
  isBlocked?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  // Support secure query token for media/PDF streaming requests
  if (!token && req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'جلسة العمل غير متوفرة أو منتهية. يرجى تسجيل الدخول.',
      },
    });
  }

  try {
    const decoded = jwt.verify(token, serverConfig.jwtSecret) as any;
    
    // Verify user exists and is active in Central Database
    const { rows } = await db.query(
      'SELECT id, name, registration_number, role_id, grade, email, is_active, is_blocked, token_version FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_INACTIVE',
          message: 'الحساب غير مفعل أو غير موجود في قاعدة البيانات المركزية.',
        },
      });
    }

    const u = rows[0];
    if (u.is_blocked) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'USER_BLOCKED',
          message: 'الحساب موقوف حالياً من الوصول إلى الموارد الرقمية.',
        },
      });
    }

    // Verify token version (session revocation on password reset)
    const currentTokenVersion = u.token_version || 1;
    const tokenVersionInJwt = decoded.tokenVersion || 1;
    if (tokenVersionInJwt !== currentTokenVersion) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_REVOKED',
          message: 'تم إنهاء صلاحية هذه الجلسة بسبب تغيير كلمة المرور. يرجى تسجيل الدخول مجدداً.',
        },
      });
    }

    // Auto-logout on computer reboot/shutdown for students sharing the workstation
    if (decoded.role === 'student' && decoded.serverBootId && decoded.serverBootId !== serverConfig.serverBootId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_REBOOTED',
          message: 'تمت إعادة تشغيل الحاسوب أو إطفاؤه، تم تسجيل خروج الطالب تلقائياً لخصوصية الحساب.',
        },
      });
    }

    req.user = {
      id: u.id,
      name: u.name,
      registrationNumber: u.registration_number,
      role: u.role_id || 'student',
      grade: u.grade,
      email: u.email,
      isBlocked: u.is_blocked || false,
    };

    next();
  } catch (err: any) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'رمز التحقق غير صالح أو منتهي الصلاحية.',
      },
    });
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, serverConfig.jwtSecret) as any;
    db.query('SELECT id, name, registration_number, role_id, grade, email, is_active, is_blocked, token_version FROM users WHERE id = $1', [decoded.userId])
      .then(({ rows }) => {
        if (rows.length > 0 && rows[0].is_active && !rows[0].is_blocked) {
          const u = rows[0];
          const currentTokenVersion = u.token_version || 1;
          const tokenVersionInJwt = decoded.tokenVersion || 1;
          if (tokenVersionInJwt === currentTokenVersion) {
            req.user = {
              id: u.id,
              name: u.name,
              registrationNumber: u.registration_number,
              role: u.role_id || 'student',
              grade: u.grade,
              email: u.email,
              isBlocked: u.is_blocked || false,
            };
          }
        }
        next();
      })
      .catch(() => next());
  } catch {
    next();
  }
}
