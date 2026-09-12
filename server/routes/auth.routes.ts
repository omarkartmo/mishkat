import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/pool';
import { serverConfig } from '../config';
import { authenticateToken } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import { recordAuditLog } from '../middleware/audit';

const router = Router();

// POST /api/v1/auth/login
router.post('/login', authRateLimiter(15), async (req: Request, res: Response) => {
  const { registrationNumber, password } = req.body;

  if (!registrationNumber) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'يرجى إدخال رقم القيد أو اسم المستخدم.' },
    });
  }

  const cleanReg = String(registrationNumber).trim();

  try {
    const { rows } = await db.query(
      `SELECT id, registration_number, name, email, phone, role_id, grade, avatar_url,
              password_hash, is_active, is_blocked, is_blocked_from_borrowing, block_reason, token_version
       FROM users WHERE registration_number = $1 OR username = $1 LIMIT 1`,
      [cleanReg]
    );

    if (rows.length === 0) {
      await recordAuditLog(null, cleanReg, 'guest', 'LOGIN_FAILED', 'user', null, { reason: 'User not found' }, req);
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'رقم القيد أو كلمة المرور غير صحيحة.' },
      });
    }

    const user = rows[0];

    if (!user.is_active || user.is_blocked) {
      await recordAuditLog(user.id, user.name, user.role_id, 'LOGIN_BLOCKED', 'user', user.id, { reason: user.block_reason }, req);
      return res.status(403).json({
        success: false,
        error: {
          code: 'USER_BLOCKED',
          message: user.block_reason || 'هذا الحساب معطل أو محظور من قبل إدارة المكتبة المركزية.',
        },
      });
    }

    // Verify Password securely using bcrypt
    let isPasswordValid = false;
    if (password && user.password_hash) {
      isPasswordValid = await bcrypt.compare(password, user.password_hash);
    } else if (user.role_id === 'admin' && !password) {
      return res.status(401).json({
        success: false,
        error: { code: 'PASSWORD_REQUIRED', message: 'حساب أمين المكتبة يتطلب كلمة المرور.' },
      });
    }

    if (!isPasswordValid) {
      await recordAuditLog(user.id, user.name, user.role_id, 'LOGIN_FAILED', 'user', user.id, { reason: 'Bad password' }, req);
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'كلمة المرور غير صحيحة.' },
      });
    }

    // Update last login
    await db.query('UPDATE users SET last_login_at = $1 WHERE id = $2', [new Date().toISOString(), user.id]);

    // Generate JWT Token with tokenVersion for session revocation
    const token = jwt.sign(
      {
        userId: user.id,
        registrationNumber: user.registration_number,
        role: user.role_id,
        tokenVersion: user.token_version || 1,
      },
      serverConfig.jwtSecret,
      { expiresIn: '7d' }
    );

    const userPayload = {
      id: user.id,
      name: user.name,
      registrationNumber: user.registration_number,
      role: user.role_id,
      grade: user.grade,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      isBlocked: user.is_blocked || false,
      isBlockedFromBorrowing: user.is_blocked_from_borrowing || false,
      blockReason: user.block_reason,
      createdAt: user.created_at,
    };

    await recordAuditLog(user.id, user.name, user.role_id, 'LOGIN_SUCCESS', 'user', user.id, null, req);

    res.json({
      success: true,
      data: {
        token,
        user: userPayload,
      },
    });
  } catch (err: any) {
    console.error('[Auth Error]', err);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'فشل تسجيل الدخول على الخادم المركزي.' },
    });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT id, registration_number, name, email, phone, role_id, grade, avatar_url,
              is_active, is_blocked, is_blocked_from_borrowing, block_reason, created_at
       FROM users WHERE id = $1 LIMIT 1`,
      [req.user!.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود.' },
      });
    }

    const u = rows[0];
    res.json({
      success: true,
      data: {
        user: {
          id: u.id,
          name: u.name,
          registrationNumber: u.registration_number,
          role: u.role_id,
          grade: u.grade,
          email: u.email,
          phone: u.phone,
          avatarUrl: u.avatar_url,
          isBlocked: u.is_blocked,
          isBlockedFromBorrowing: u.is_blocked_from_borrowing,
          blockReason: u.block_reason,
          createdAt: u.created_at,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'LOGOUT', 'user', req.user!.id, null, req);
  res.json({
    success: true,
    data: { message: 'تم تسجيل الخروج بنجاح من الخادم المركزي.' },
  });
});

// GET /api/v1/auth/security-question
router.get('/security-question', authRateLimiter(15), async (req: Request, res: Response) => {
  const { registrationNumber } = req.query;
  
  if (!registrationNumber) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'رقم القيد مطلوب.' }});
  }

  try {
    const { rows } = await db.query(
      `SELECT security_question FROM users WHERE (registration_number = $1 OR username = $1) AND role_id = 'admin' LIMIT 1`,
      [String(registrationNumber).trim()]
    );

    if (rows.length === 0 || !rows[0].security_question) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'لا يوجد سؤال أمان مسجل لهذا الحساب، أو الحساب غير موجود.' } });
    }

    res.json({ success: true, data: { question: rows[0].security_question }});
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'خطأ في جلب سؤال الأمان.' } });
  }
});

// POST /api/v1/auth/recover
router.post('/recover', authRateLimiter(5), async (req: Request, res: Response) => {
  const { registrationNumber, securityAnswer, newPassword } = req.body;

  if (!registrationNumber || !securityAnswer || !newPassword) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'يرجى إدخال جميع البيانات المطلوبة.' },
    });
  }

  const cleanReg = String(registrationNumber).trim();

  try {
    const { rows } = await db.query(
      `SELECT id, role_id, security_answer_hash FROM users WHERE registration_number = $1 OR username = $1 LIMIT 1`,
      [cleanReg]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'رقم القيد غير صحيح.' },
      });
    }

    const user = rows[0];
    if (user.role_id !== 'admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'استرجاع كلمة المرور متاح للمشرفين فقط بهذه الطريقة.' },
      });
    }

    if (!user.security_answer_hash) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_SECURITY_SETUP', message: 'لم يتم إعداد سؤال الأمان مسبقاً لهذا الحساب.' },
      });
    }

    const isAnswerValid = await bcrypt.compare(securityAnswer.trim().toLowerCase(), user.security_answer_hash);
    
    if (!isAnswerValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'إجابة سؤال الأمان غير صحيحة.' },
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    await db.query('UPDATE users SET password_hash = $1, token_version = COALESCE(token_version, 1) + 1 WHERE id = $2', [newPasswordHash, user.id]);
    await recordAuditLog(user.id, 'Admin', 'admin', 'PASSWORD_RECOVERED', 'user', user.id, null, req);

    res.json({
      success: true,
      data: { message: 'تم تغيير كلمة المرور واسترجاع الحساب بنجاح، يمكنك الآن تسجيل الدخول.' },
    });
  } catch (err: any) {
    console.error('[Auth Error]', err);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'فشل استرجاع الحساب.' },
    });
  }
});

export default router;
