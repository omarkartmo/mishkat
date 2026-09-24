import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';
import { generateSecureStudentPassword } from '../utils/passwordGenerator';

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
router.post('/', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { registrationNumber, name, grade, email, phone, role = 'student', password } = req.body;

  if (!registrationNumber || !name) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'رقم القيد واسم الطالب مطلوبان.' },
    });
  }

  // Prevent librarian from creating admin accounts
  if (req.user!.role === 'librarian' && role === 'admin') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'لا يمكن لأمين المكتبة إنشاء حساب مشرف عام.' },
    });
  }

  try {
    const id = `stu-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    
    // Auto-generate strong cryptographically secure password if not provided by admin
    const effectivePassword = (password && typeof password === 'string' && password.trim().length >= 6 && req.user!.role === 'admin')
      ? password.trim()
      : generateSecureStudentPassword(8);

    const passHash = await bcrypt.hash(effectivePassword, 10);

    await db.query(`
      INSERT INTO users (
        id, registration_number, name, role_id, grade, email, phone,
        password_hash, token_version, is_active, is_blocked, is_blocked_from_borrowing
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, true, false, false)
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

    // Omit password from audit log completely
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
        generatedPassword: effectivePassword, // Returned ONLY here to allow immediate printing of credential card
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PUT /api/v1/users/admin/security (Admin updates their initial registration info, password, and security question)
// Registered BEFORE /:id to prevent any route interception or ambiguity
router.put('/admin/security', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const {
    currentPassword,
    registrationNumber,
    name,
    username,
    email,
    phone,
    newPassword,
    securityQuestion,
    securityAnswer,
  } = req.body;
  const adminId = req.user!.id;

  try {
    const { rows } = await db.query('SELECT password_hash, registration_number, name FROM users WHERE id = $1', [adminId]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'حساب المشرف غير موجود.' } });

    const user = rows[0];
    const isCurrentValid = await bcrypt.compare(currentPassword || '', user.password_hash);
    
    if (!isCurrentValid) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'كلمة المرور الحالية غير صحيحة للتأكيد.' } });
    }

    let updates: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    // 1. Initial Registration Number update with uniqueness check
    if (registrationNumber && registrationNumber.trim()) {
      const cleanReg = registrationNumber.trim();
      const { rows: conflict } = await db.query(
        'SELECT id FROM users WHERE (registration_number = $1 OR username = $1) AND id != $2',
        [cleanReg, adminId]
      );
      if (conflict.length > 0) {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'رقم القيد مستخدم بالفعل لحساب آخر.' } });
      }
      updates.push(`registration_number = $${paramIndex++}`);
      params.push(cleanReg);
    }

    // 2. Full Name
    if (name && name.trim()) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }

    // 3. Username with uniqueness check
    if (username !== undefined) {
      const cleanUsername = String(username).trim() || null;
      if (cleanUsername) {
        const { rows: uConflict } = await db.query(
          'SELECT id FROM users WHERE (username = $1 OR registration_number = $1) AND id != $2',
          [cleanUsername, adminId]
        );
        if (uConflict.length > 0) {
          return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'اسم المستخدم مستخدم بالفعل لحساب آخر.' } });
        }
      }
      updates.push(`username = $${paramIndex++}`);
      params.push(cleanUsername);
    }

    // 4. Email & Phone
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      params.push(String(email).trim() || null);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      params.push(String(phone).trim() || null);
    }

    // 5. New Password
    if (newPassword) {
      updates.push(`password_hash = $${paramIndex++}`);
      params.push(await bcrypt.hash(newPassword, 10));
      updates.push('token_version = COALESCE(token_version, 1) + 1');
    }

    // 6. Security Question & Answer
    if (securityQuestion && securityAnswer) {
      updates.push(`security_question = $${paramIndex++}`);
      params.push(securityQuestion.trim());
      
      updates.push(`security_answer_hash = $${paramIndex++}`);
      params.push(await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10));
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(adminId);
      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
      await db.query(sql, params);
      await recordAuditLog(adminId, req.user!.name, 'admin', 'UPDATE_ADMIN_SECURITY', 'user', adminId, null, req);
    }

    const { rows: updatedRows } = await db.query(
      'SELECT id, registration_number, name, username, email, phone, role_id, security_question FROM users WHERE id = $1',
      [adminId]
    );
    const updated = updatedRows[0];

    res.json({
      success: true,
      data: {
        message: 'تم تحديث معلومات الحساب وإعدادات الأمان بنجاح.',
        user: {
          id: updated.id,
          name: updated.name,
          registrationNumber: updated.registration_number,
          username: updated.username,
          email: updated.email,
          phone: updated.phone,
          role: updated.role_id,
          hasSecurityQuestion: Boolean(updated.security_question),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PUT /api/v1/users/my-security (Any user/student updates their security question and password)
// Registered BEFORE /:id
router.put('/my-security', authenticateToken, async (req: Request, res: Response) => {
  const { currentPassword, newPassword, securityQuestion, securityAnswer, username } = req.body;
  const userId = req.user!.id;

  try {
    const { rows } = await db.query('SELECT password_hash, role_id, security_question FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود.' } });
    }

    const user = rows[0];

    // Require current password for security verification
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'يرجى إدخال كلمة المرور الحالية لتأكيد الإعدادات.' },
      });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'كلمة المرور الحالية غير صحيحة.' },
      });
    }

    let updates: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    // Optional username update
    if (username !== undefined) {
      const cleanUsername = String(username).trim() || null;
      if (cleanUsername) {
        const { rows: uConflict } = await db.query(
          'SELECT id FROM users WHERE (username = $1 OR registration_number = $1) AND id != $2',
          [cleanUsername, userId]
        );
        if (uConflict.length > 0) {
          return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'اسم المستخدم مستخدم بالفعل.' } });
        }
      }
      updates.push(`username = $${paramIndex++}`);
      params.push(cleanUsername);
    }

    // Optional password change
    if (newPassword && newPassword.trim()) {
      if (newPassword.trim().length < 4) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'يجب أن لا تقل كلمة المرور الجديدة عن 4 خانات.' },
        });
      }
      updates.push(`password_hash = $${paramIndex++}`);
      params.push(await bcrypt.hash(newPassword.trim(), 10));
      updates.push('token_version = COALESCE(token_version, 1) + 1');
    }

    // Security question & answer setup
    if (securityQuestion && securityAnswer) {
      if (!securityQuestion.trim() || !securityAnswer.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'يرجى كتابة سؤال الأمان والإجابة عليه.' },
        });
      }
      updates.push(`security_question = $${paramIndex++}`);
      params.push(securityQuestion.trim());

      updates.push(`security_answer_hash = $${paramIndex++}`);
      params.push(await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10));
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(userId);
      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
      await db.query(sql, params);
      await recordAuditLog(userId, req.user!.name, user.role_id, 'UPDATE_MY_SECURITY', 'user', userId, null, req);
    }

    res.json({
      success: true,
      data: {
        message: 'تم تحديث إعدادات الأمان وسؤال الاسترداد بنجاح.',
        hasSecurityQuestion: Boolean(securityQuestion || user.security_question),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/users/roster-import (Batch student import)
// Registered BEFORE /:id to prevent route interception
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
    const generatedCredentials: Array<{ name: string; registrationNumber: string; grade: string; password: string; tempPass: string }> = [];

    await db.transaction(async (client) => {
      for (const s of students) {
        if (!s.registrationNumber || !s.name) continue;
        const id = `stu-imp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        
        // Generate unique cryptographically secure random password for each student
        const studentPlainPass = generateSecureStudentPassword(8);
        const passHash = await bcrypt.hash(studentPlainPass, 10);

        await client.query(`
          INSERT INTO users (
            id, registration_number, name, role_id, grade,
            password_hash, token_version, is_active, is_blocked, is_blocked_from_borrowing
          ) VALUES ($1, $2, $3, 'student', $4, $5, 1, true, false, false)
          ON CONFLICT (registration_number) DO UPDATE SET
            name = EXCLUDED.name,
            grade = EXCLUDED.grade,
            password_hash = EXCLUDED.password_hash,
            token_version = COALESCE(users.token_version, 1) + 1;
        `, [id, s.registrationNumber.trim(), s.name.trim(), s.grade || '', passHash]);

        generatedCredentials.push({
          name: s.name.trim(),
          registrationNumber: s.registrationNumber.trim(),
          grade: s.grade || '',
          password: studentPlainPass,
          tempPass: studentPlainPass,
        });
        imported++;
      }
    });

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'IMPORT_ROSTER', 'users', null, { count: imported }, req);

    res.json({
      success: true,
      data: {
        message: `تم استيراد ${imported} طالباً بنجاح وتوليد كلمات مرور قوية لكل حساب.`,
        importedCount: imported,
        generatedCredentials,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/users/batch-reset-passwords (Batch reset passwords for selected students for bulk printing)
// Registered BEFORE /:id to prevent route interception
router.post('/batch-reset-passwords', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'يرجى تحديد قائمة الطلاب لإعادة تعيين كلمات المرور.' },
    });
  }

  try {
    const updatedStudents: Array<{ id: string; name: string; registrationNumber: string; grade?: string; password: string }> = [];

    await db.transaction(async (client) => {
      for (const studentId of studentIds) {
        const { rows } = await client.query(
          "SELECT id, name, registration_number, role_id, grade FROM users WHERE id = $1 AND role_id = 'student'",
          [studentId]
        );
        if (rows.length === 0) continue;

        const u = rows[0];
        const studentPlainPass = generateSecureStudentPassword(8);
        const passHash = await bcrypt.hash(studentPlainPass, 10);

        await client.query(
          'UPDATE users SET password_hash = $1, token_version = COALESCE(token_version, 1) + 1 WHERE id = $2',
          [passHash, u.id]
        );

        updatedStudents.push({
          id: u.id,
          name: u.name,
          registrationNumber: u.registration_number,
          grade: u.grade,
          password: studentPlainPass,
        });
      }
    });

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'BATCH_RESET_PASSWORDS', 'users', null, { count: updatedStudents.length }, req);

    res.json({
      success: true,
      data: {
        message: `تمت إعادة تعيين كلمات المرور لـ ${updatedStudents.length} طالباً بنجاح.`,
        resetCount: updatedStudents.length,
        students: updatedStudents,
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
      passUpdateSql = `, password_hash = $8, token_version = COALESCE(token_version, 1) + 1`;
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
    if (req.user?.id === id) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_DELETE_SELF', message: 'لا يمكنك حذف الحساب الحالي المسجل به.' },
      });
    }

    // Check if student has active or overdue loans
    const activeLoans = await db.query(
      "SELECT id, book_title FROM loans WHERE student_id = $1 AND status IN ('active', 'extended', 'overdue')",
      [id]
    );
    if (activeLoans.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'HAS_ACTIVE_LOANS',
          message: `لا يمكن حذف حساب الطالب لوجود ${activeLoans.rows.length} إعارة نشطة أو متأخرة لم يتم إرجاعها بعد.`
        }
      });
    }

    // Check if user has past loans
    const pastLoans = await db.query('SELECT id FROM loans WHERE student_id = $1', [id]);
    if (pastLoans.rows.length === 0) {
      // Hard delete cleanly
      await db.query('DELETE FROM users WHERE id = $1', [id]);
    } else {
      // Soft delete to maintain loan history while releasing registration number
      await db.query(
        "UPDATE users SET is_active = false, registration_number = registration_number || '__del_' || SUBSTRING(id FROM 1 FOR 8) WHERE id = $1",
        [id]
      );
    }

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'DELETE_USER', 'user', id, null, req);
    res.json({ success: true, data: { message: 'تم حذف حساب الطالب من النظام المركزي بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/users/:id/reset-password
router.post('/:id/reset-password', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const targetRes = await db.query(
      'SELECT id, name, registration_number, role_id, grade FROM users WHERE id = $1',
      [id]
    );

    if (targetRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود بالخادم المركزي.' },
      });
    }

    const targetUser = targetRes.rows[0];

    // Librarian cannot reset admin passwords
    if (req.user!.role === 'librarian' && targetUser.role_id === 'admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'لا يمكن لأمين المكتبة إعادة تعيين كلمة مرور المشرف العام.' },
      });
    }

    // Server-side authoritative CSPRNG password generation
    // Never allow predictable passwords such as '123', '123456', etc.
    let plainPassword = (req.body && typeof req.body.newPassword === 'string') ? req.body.newPassword.trim() : '';
    const forbidden = ['123', '1234', '12345', '123456', '12345678', 'password', 'student', 'admin', 'admin123'];
    if (!plainPassword || plainPassword.length < 6 || forbidden.includes(plainPassword.toLowerCase()) || req.user!.role !== 'admin') {
      plainPassword = generateSecureStudentPassword(8);
    }

    const passHash = await bcrypt.hash(plainPassword, 10);

    // Invalidate existing sessions by incrementing token_version
    await db.query(
      'UPDATE users SET password_hash = $1, token_version = COALESCE(token_version, 1) + 1 WHERE id = $2',
      [passHash, id]
    );

    // Audit log records event with metadata only — NEVER records plaintext password
    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'RESET_PASSWORD',
      'user',
      id,
      { targetRegistrationNumber: targetUser.registration_number, targetName: targetUser.name },
      req
    );

    res.json({
      success: true,
      data: {
        message: 'تمت إعادة تعيين كلمة المرور بنجاح في الخادم المركزي.',
        newPassword: plainPassword,
        generatedPassword: plainPassword,
        student: {
          id: targetUser.id,
          name: targetUser.name,
          registrationNumber: targetUser.registration_number,
          grade: targetUser.grade,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
