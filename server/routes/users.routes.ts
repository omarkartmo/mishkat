import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';

const router = Router();

// GET /api/v1/users (Admin only)
router.get('/', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  try {
    const { role, search } = req.query;
    let sql = 'SELECT id, registration_number, name, email, phone, role_id, grade, avatar_url, is_active, is_blocked, is_blocked_from_borrowing, block_reason, created_at, last_login_at FROM users WHERE is_active = true';
    const params: any[] = [];

    if (role) {
      params.push(role);
      sql += ` AND role_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (name ILIKE $${params.length} OR registration_number ILIKE $${params.length})`;
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await db.query(sql, params);
    
    const formatted = rows.map(u => ({
      id: u.id,
      name: u.name,
      registrationNumber: u.registration_number,
      role: u.role_id,
      grade: u.grade,
      email: u.email,
      phone: u.phone,
      avatarUrl: u.avatar_url,
      isBlocked: u.is_blocked || false,
      isBlockedFromBorrowing: u.is_blocked_from_borrowing || false,
      blockReason: u.block_reason,
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/users (Create student/user)
router.post('/', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { registrationNumber, name, grade, email, phone, role = 'student', password = '123' } = req.body;

  if (!registrationNumber || !name) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'رقم القيد واسم الطالب مطلوبان.' },
    });
  }

  try {
    const id = `stu-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const passHash = await bcrypt.hash(password, 10);

    await db.query(`
      INSERT INTO users (
        id, registration_number, name, role_id, grade, email, phone,
        password_hash, is_active, is_blocked, is_blocked_from_borrowing
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, false, false)
    `, [
      id,
      registrationNumber.trim(),
      name.trim(),
      role,
      grade || '',
      email || null,
      phone || null,
      passHash,
    ]);

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'CREATE_USER', 'user', id, { registrationNumber, name, grade }, req);

    res.status(201).json({
      success: true,
      data: {
        id,
        registrationNumber,
        name,
        role,
        grade,
        email,
        phone,
        isBlocked: false,
        isBlockedFromBorrowing: false,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PUT /api/v1/users/:id
router.put('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, grade, email, phone, isBlocked, isBlockedFromBorrowing, blockReason, password } = req.body;

  try {
    let passUpdateSql = '';
    const params: any[] = [name, grade, email, phone, isBlocked ?? false, isBlockedFromBorrowing ?? false, blockReason ?? null, id];

    if (password) {
      const passHash = await bcrypt.hash(password, 10);
      params.splice(7, 0, passHash);
      passUpdateSql = `, password_hash = $8`;
    }

    const sql = `
      UPDATE users SET
        name = $1, grade = $2, email = $3, phone = $4,
        is_blocked = $5, is_blocked_from_borrowing = $6, block_reason = $7
        ${passUpdateSql}
      WHERE id = $${params.length}
    `;

    await db.query(sql, params);
    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'UPDATE_USER', 'user', id, { name, grade, isBlocked }, req);

    res.json({ success: true, data: { message: 'تم تحديث بيانات المستخدم في الخادم المركزي بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/users/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [id]);
    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'DELETE_USER', 'user', id, null, req);
    res.json({ success: true, data: { message: 'تم حذف المستخدم من النظام المركزي بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/users/roster-import (Batch student import)
router.post('/roster-import', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'قائمة الطلاب غير صالحة أو فارغة.' },
    });
  }

  try {
    let imported = 0;
    const defaultPassHash = await bcrypt.hash('123456', 10);

    await db.transaction(async (client) => {
      for (const s of students) {
        if (!s.registrationNumber || !s.name) continue;
        const id = `stu-imp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await client.query(`
          INSERT INTO users (
            id, registration_number, name, role_id, grade,
            password_hash, is_active, is_blocked, is_blocked_from_borrowing
          ) VALUES ($1, $2, $3, 'student', $4, $5, true, false, false)
          ON CONFLICT (registration_number) DO UPDATE SET
            name = EXCLUDED.name,
            grade = EXCLUDED.grade;
        `, [id, s.registrationNumber.trim(), s.name.trim(), s.grade || '', defaultPassHash]);
        imported++;
      }
    });

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'IMPORT_ROSTER', 'users', null, { count: imported }, req);

    res.json({
      success: true,
      data: { message: `تم استيراد ${imported} طالباً بنجاح وتخزينهم في الخادم المركزي.` },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
