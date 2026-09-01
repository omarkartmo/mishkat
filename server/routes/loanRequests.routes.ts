import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';

const router = Router();

// GET /api/v1/loan-requests
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    let sql = 'SELECT * FROM loan_requests WHERE 1=1';
    const params: any[] = [];

    if (req.user!.role === 'student') {
      params.push(req.user!.id);
      sql += ` AND student_id = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await db.query(sql, params);

    const formatted = rows.map((r) => ({
      id: r.id,
      bookId: r.book_id,
      bookTitle: r.book_title,
      bookAuthor: r.book_author,
      bookLocation: {
        cabinet: r.cabinet || '',
        shelf: r.shelf || '',
        section: r.section || '',
      },
      studentId: r.student_id,
      studentName: r.student_name,
      studentRegNumber: r.student_reg_number,
      studentGrade: r.student_grade,
      purpose: r.purpose,
      customReason: r.custom_reason,
      requestedDurationDays: r.requested_duration_days || 7,
      requestedAt: r.requested_at,
      status: r.status,
      approvedDurationDays: r.approved_duration_days,
      approvedAt: r.approved_at,
      dueDateCalculated: r.due_date_calculated,
      adminNotes: r.admin_notes,
      rejectionReason: r.rejection_reason,
      handedOverAt: r.handed_over_at,
      loanRecordId: r.loan_record_id,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/loan-requests (Student submits request)
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const { bookId, purpose = 'مطالعة عامة', customReason, requestedDurationDays = 7 } = req.body;

  if (!bookId) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'معرف الكتاب مطلوب لتقديم طلب الاستعارة.' },
    });
  }

  try {
    const { rows: bookRows } = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
    if (bookRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'BOOK_NOT_FOUND', message: 'الكتاب غير موجود.' } });
    }
    const book = bookRows[0];

    const id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const requestedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

    await db.query(`
      INSERT INTO loan_requests (
        id, book_id, book_title, book_author, cabinet, shelf, section,
        student_id, student_name, student_reg_number, student_grade,
        purpose, custom_reason, requested_duration_days, requested_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending')
    `, [
      id,
      book.id,
      book.title,
      book.author,
      book.cabinet || '',
      book.shelf || '',
      book.section || '',
      req.user!.id,
      req.user!.name,
      req.user!.registrationNumber,
      req.user!.grade || '',
      purpose,
      customReason || null,
      requestedDurationDays,
      requestedAt,
    ]);

    // Create notification for admin
    await db.query(`
      INSERT INTO notifications (
        id, recipient_id, recipient_role, title, message, type, target_tab, target_entity_id, is_read, created_at
      ) VALUES ($1, 'admin', 'admin', $2, $3, 'loan_request_submitted', 'loans', $4, false, $5)
    `, [
      `notif-${Date.now()}`,
      'طلب استعارة جديد',
      `قدم الطالب ${req.user!.name} طلب استعارة لكتاب "${book.title}".`,
      id,
      requestedAt,
    ]);

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'CREATE_LOAN_REQUEST', 'loan_request', id, { bookId, purpose }, req);

    res.status(201).json({
      success: true,
      data: {
        id,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        bookLocation: { cabinet: book.cabinet, shelf: book.shelf, section: book.section },
        studentId: req.user!.id,
        studentName: req.user!.name,
        studentRegNumber: req.user!.registrationNumber,
        studentGrade: req.user!.grade,
        purpose,
        customReason,
        requestedDurationDays,
        requestedAt,
        status: 'pending',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/loan-requests/:id/approve (Admin approves request)
router.post('/:id/approve', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { approvedDurationDays = 7, adminNotes } = req.body;

  try {
    const approvedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const due = new Date();
    due.setDate(due.getDate() + approvedDurationDays);
    const dueDateCalculated = due.toISOString().split('T')[0];

    const { rows } = await db.query(`
      UPDATE loan_requests SET
        status = 'approved',
        approved_duration_days = $1,
        approved_at = $2,
        due_date_calculated = $3,
        admin_notes = $4
      WHERE id = $5
      RETURNING *
    `, [approvedDurationDays, approvedAt, dueDateCalculated, adminNotes || null, id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'طلب الاستعارة غير موجود.' } });
    }

    const reqRecord = rows[0];

    // Send notification to student
    await db.query(`
      INSERT INTO notifications (
        id, recipient_id, recipient_role, title, message, type, target_tab, target_entity_id, is_read, created_at
      ) VALUES ($1, $2, 'student', $3, $4, 'loan_request_approved', 'student_portal', $5, false, $6)
    `, [
      `notif-${Date.now()}`,
      reqRecord.student_id,
      'تمت الموافقة على طلب الاستعارة',
      `تمت الموافقة على طلب استعارة كتاب "${reqRecord.book_title}". يرجى التوجه لمكتب الاستعارة لتسلم النسخة.`,
      id,
      approvedAt,
    ]);

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'APPROVE_LOAN_REQUEST', 'loan_request', id, null, req);

    res.json({ success: true, data: { message: 'تمت الموافقة على طلب الاستعارة بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/loan-requests/:id/reject
router.post('/:id/reject', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { rejectionReason = 'عذراً، الكتاب غير متاح حالياً للإعارة الخارجية.' } = req.body;

  try {
    const { rows } = await db.query(`
      UPDATE loan_requests SET status = 'rejected', rejection_reason = $1 WHERE id = $2 RETURNING *
    `, [rejectionReason, id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'طلب الاستعارة غير موجود.' } });
    }

    const reqRecord = rows[0];
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);

    // Notify student
    await db.query(`
      INSERT INTO notifications (
        id, recipient_id, recipient_role, title, message, type, target_tab, target_entity_id, is_read, created_at
      ) VALUES ($1, $2, 'student', $3, $4, 'loan_request_rejected', 'student_portal', $5, false, $6)
    `, [
      `notif-${Date.now()}`,
      reqRecord.student_id,
      'تحديث بخصوص طلب الاستعارة',
      `نعتذر، تم رفض طلب استعارة كتاب "${reqRecord.book_title}". السبب: ${rejectionReason}`,
      id,
      nowStr,
    ]);

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'REJECT_LOAN_REQUEST', 'loan_request', id, { rejectionReason }, req);

    res.json({ success: true, data: { message: 'تم رفض طلب الاستعارة وإشعار الطالب.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/loan-requests/:id/handover (Atomic handover transaction)
router.post('/:id/handover', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const loanId = `loan-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    await db.transaction(async (client) => {
      const { rows: reqRows } = await client.query('SELECT * FROM loan_requests WHERE id = $1', [id]);
      if (reqRows.length === 0) {
        throw new Error('طلب الاستعارة غير موجود.');
      }
      const r = reqRows[0];

      // Check available copies
      const { rows: bookRows } = await client.query('SELECT * FROM books WHERE id = $1', [r.book_id]);
      if (bookRows.length === 0) {
        throw new Error('الكتاب غير موجود.');
      }
      const book = bookRows[0];

      // Decrement copies and set copy to borrowed
      await client.query('UPDATE books SET available_copies = GREATEST(0, available_copies - 1) WHERE id = $1', [r.book_id]);

      const { rows: copyRows } = await client.query("SELECT id FROM physical_copies WHERE book_id = $1 AND status = 'available' LIMIT 1", [r.book_id]);
      const copyId = copyRows.length > 0 ? copyRows[0].id : null;
      if (copyId) {
        await client.query("UPDATE physical_copies SET status = 'borrowed' WHERE id = $1", [copyId]);
      }

      const issueDate = new Date().toISOString().split('T')[0];
      const dueDate = r.due_date_calculated || (() => {
        const d = new Date();
        d.setDate(d.getDate() + (r.approved_duration_days || 7));
        return d.toISOString().split('T')[0];
      })();

      const validPurpose = (r.purpose === 'academic_research' || r.purpose === 'general_reading')
        ? r.purpose
        : (r.purpose?.includes('بحث') || r.purpose?.includes('تخرج') ? 'academic_research' : 'general_reading');

      // Create active loan record
      await client.query(`
        INSERT INTO loans (
          id, book_id, book_title, copy_id, student_id, student_name, student_reg_number,
          purpose, issue_date, due_date, status, extension_count, max_extensions_allowed, notes, issued_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', 0, 1, $11, $12)
      `, [
        loanId,
        book.id,
        book.title,
        copyId,
        r.student_id,
        r.student_name,
        r.student_reg_number,
        validPurpose,
        issueDate,
        dueDate,
        r.admin_notes || null,
        req.user!.id,
      ]);

      // Mark request as handed over
      await client.query(`
        UPDATE loan_requests SET status = 'handed_over', handed_over_at = $1, loan_record_id = $2 WHERE id = $3
      `, [nowStr, loanId, id]);
    });

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'HANDOVER_BOOK', 'loan_request', id, { loanId }, req);

    res.json({ success: true, data: { message: 'تم تسليم الكتاب بنجاح وتفعيل سجل الإعارة في الخادم المركزي.', loanId } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'HANDOVER_FAILED', message: err.message } });
  }
});

export default router;
