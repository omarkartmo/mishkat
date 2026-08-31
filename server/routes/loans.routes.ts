import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';

const router = Router();

// GET /api/v1/loans
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { studentId, status } = req.query;
    let sql = 'SELECT * FROM loans WHERE 1=1';
    const params: any[] = [];

    // If user is student, restrict to their loans only (Authorization enforcement)
    if (req.user!.role === 'student') {
      params.push(req.user!.id);
      sql += ` AND student_id = $${params.length}`;
    } else if (studentId) {
      params.push(studentId);
      sql += ` AND student_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await db.query(sql, params);

    const formatted = rows.map((l) => ({
      id: l.id,
      bookId: l.book_id,
      bookTitle: l.book_title,
      studentId: l.student_id,
      studentName: l.student_name,
      studentRegNumber: l.student_reg_number,
      purpose: l.purpose,
      issueDate: l.issue_date,
      dueDate: l.due_date,
      returnDate: l.return_date,
      status: l.status,
      extensionCount: l.extension_count || 0,
      maxExtensionsAllowed: l.max_extensions_allowed || 1,
      notes: l.notes,
      isOverrideExemption: l.is_override_exemption,
      overrideReason: l.override_reason,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/loans (Atomic transaction to issue loan)
router.post('/', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { bookId, studentId, purpose = 'general_reading', customDurationDays = 7, notes, isOverrideExemption, overrideReason } = req.body;

  if (!bookId || !studentId) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'معرف الكتاب ومعرف الطالب مطلوبان لإصدار الإعارة.' },
    });
  }

  try {
    const loanId = `loan-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const issueDate = new Date().toISOString().split('T')[0];
    const due = new Date();
    due.setDate(due.getDate() + (customDurationDays || 7));
    const dueDate = due.toISOString().split('T')[0];

    const result = await db.transaction(async (client) => {
      // 1. Check book existence and available copies
      const { rows: bookRows } = await client.query('SELECT id, title, available_copies FROM books WHERE id = $1', [bookId]);
      if (bookRows.length === 0) {
        throw new Error('الكتاب غير موجود في سجلات المكتبة.');
      }
      const book = bookRows[0];
      if (book.available_copies <= 0 && !isOverrideExemption) {
        throw new Error('عذراً، لا توجد نسخ متوفرة حالياً من هذا الكتاب للإعارة.');
      }

      // 2. Check student existence and borrowing eligibility
      const { rows: studentRows } = await client.query('SELECT id, name, registration_number, is_blocked_from_borrowing FROM users WHERE id = $1', [studentId]);
      if (studentRows.length === 0) {
        throw new Error('سجل الطالب غير موجود.');
      }
      const student = studentRows[0];
      if (student.is_blocked_from_borrowing && !isOverrideExemption) {
        throw new Error('الطالب محظور من الاستعارة بسبب تأخيرات سابقة.');
      }

      // 3. Find an available physical copy
      const { rows: copyRows } = await client.query("SELECT id FROM physical_copies WHERE book_id = $1 AND status = 'available' LIMIT 1", [bookId]);
      const copyId = copyRows.length > 0 ? copyRows[0].id : null;

      // 4. Update physical copy status if exists
      if (copyId) {
        await client.query("UPDATE physical_copies SET status = 'borrowed' WHERE id = $1", [copyId]);
      }

      // 5. Decrement available copies on master book
      await client.query('UPDATE books SET available_copies = GREATEST(0, available_copies - 1) WHERE id = $1', [bookId]);

      // 6. Insert loan record
      await client.query(`
        INSERT INTO loans (
          id, book_id, book_title, copy_id, student_id, student_name, student_reg_number,
          purpose, issue_date, due_date, status, extension_count, max_extensions_allowed,
          notes, is_override_exemption, override_reason, issued_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', 0, 1, $11, $12, $13, $14)
      `, [
        loanId,
        book.id,
        book.title,
        copyId,
        student.id,
        student.name,
        student.registration_number,
        purpose,
        issueDate,
        dueDate,
        notes || null,
        isOverrideExemption || false,
        overrideReason || null,
        req.user!.id,
      ]);

      return {
        id: loanId,
        bookId: book.id,
        bookTitle: book.title,
        studentId: student.id,
        studentName: student.name,
        studentRegNumber: student.registration_number,
        purpose,
        issueDate,
        dueDate,
        status: 'active',
        extensionCount: 0,
        maxExtensionsAllowed: 1,
        notes,
      };
    });

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'ISSUE_LOAN', 'loan', loanId, { bookId, studentId, dueDate }, req);

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'LOAN_FAILED', message: err.message } });
  }
});

// POST /api/v1/loans/:id/return (Return book transaction)
router.post('/:id/return', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const returnDate = new Date().toISOString().split('T')[0];

  try {
    await db.transaction(async (client) => {
      const { rows: loanRows } = await client.query('SELECT * FROM loans WHERE id = $1', [id]);
      if (loanRows.length === 0) {
        throw new Error('سجل الإعارة غير موجود.');
      }
      const loan = loanRows[0];

      // Update loan status
      await client.query("UPDATE loans SET status = 'returned', return_date = $1, returned_by = $2 WHERE id = $3", [returnDate, req.user!.id, id]);

      // Release copy if associated
      if (loan.copy_id) {
        await client.query("UPDATE physical_copies SET status = 'available' WHERE id = $1", [loan.copy_id]);
      }

      // Increment available copies on master book
      await client.query('UPDATE books SET available_copies = LEAST(total_copies, available_copies + 1) WHERE id = $1', [loan.book_id]);
    });

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'RETURN_LOAN', 'loan', id, { returnDate }, req);

    res.json({ success: true, data: { message: 'تم إرجاع الكتاب وإعادة النسخة إلى الرصيد المركزي بنجاح.' } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'RETURN_FAILED', message: err.message } });
  }
});

// POST /api/v1/loans/:id/extend (Extend loan duration)
router.post('/:id/extend', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { additionalDays = 7 } = req.body;

  try {
    const { rows: loanRows } = await db.query('SELECT * FROM loans WHERE id = $1', [id]);
    if (loanRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'سجل الإعارة غير موجود.' } });
    }
    const loan = loanRows[0];

    // Authorization check
    if (req.user!.role === 'student' && loan.student_id !== req.user!.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'لا يمكنك تمديد إعارة طالب آخر.' } });
    }

    if (loan.extension_count >= loan.max_extensions_allowed && req.user!.role !== 'admin') {
      return res.status(400).json({ success: false, error: { code: 'MAX_EXTENSIONS', message: 'تم استنفاد الحد الأقصى للتمديد لهذه الإعارة.' } });
    }

    const currentDue = new Date(loan.due_date);
    currentDue.setDate(currentDue.getDate() + additionalDays);
    const newDueDate = currentDue.toISOString().split('T')[0];

    await db.query(`
      UPDATE loans SET
        due_date = $1,
        extension_count = extension_count + 1,
        status = 'extended'
      WHERE id = $2
    `, [newDueDate, id]);

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'EXTEND_LOAN', 'loan', id, { newDueDate }, req);

    res.json({ success: true, data: { message: 'تم تمديد الإعارة بنجاح.', newDueDate } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
