import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';

const router = Router();

// POST /api/v1/print-requests - Submit a new digital book print request
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { bookId, bookTitle, pageFrom, pageTo, purpose, notes } = req.body;

    if (!bookTitle || !bookTitle.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'عنوان الكتاب مطلوب لطلب الطباعة.' },
      });
    }

    const pFrom = parseInt(pageFrom, 10);
    const pTo = parseInt(pageTo, 10);

    if (isNaN(pFrom) || isNaN(pTo) || pFrom < 1 || pTo < pFrom) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAGES', message: 'نطاق الصفحات غير صالح. يجب أن تكون البداية والنهاية أرقاماً صحيحة (من ص إلى ص).' },
      });
    }

    const totalPages = pTo - pFrom + 1;
    if (totalPages > 100) {
      return res.status(400).json({
        success: false,
        error: { code: 'PAGE_LIMIT_EXCEEDED', message: 'الحد الأقصى لطلب الطباعة للعملية الواحدة هو 100 صفحة حرصاً على الموارد المكتبية.' },
      });
    }

    const requestId = `prt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const studentId = req.user!.id;
    const studentName = req.user!.name || 'طالب';
    const studentRegNumber = req.user!.registrationNumber || null;

    let validBookId: string | null = null;
    if (bookId) {
      const bookCheck = await db.query('SELECT id FROM books WHERE id = $1', [bookId]);
      if (bookCheck.rows.length > 0) {
        validBookId = bookCheck.rows[0].id;
      }
    }

    const query = `
      INSERT INTO print_requests (
        id, book_id, book_title, student_id, student_name, student_reg_number,
        page_from, page_to, total_pages, purpose, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
      RETURNING *
    `;

    const values = [
      requestId,
      validBookId,
      bookTitle.trim(),
      studentId,
      studentName,
      studentRegNumber,
      pFrom,
      pTo,
      totalPages,
      purpose?.trim() || 'بحث صفي',
      notes?.trim() || null,
    ];

    const { rows } = await db.query(query, values);
    const created = rows[0];

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'CREATE_PRINT_REQUEST',
      'print_requests',
      requestId,
      { bookTitle, pageFrom: pFrom, pageTo: pTo, totalPages },
      req
    );

    res.status(201).json({
      success: true,
      data: created,
      message: 'تم إرسال طلب الطباعة بنجاح إلى مكتب الإعارة والتداول.',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

// GET /api/v1/print-requests - List print requests
// Students get their own requests; Admins/Librarians get all
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const isStaff = req.user!.role === 'admin' || req.user!.role === 'librarian';
    const { status, studentId } = req.query;

    let sql = 'SELECT * FROM print_requests WHERE 1=1';
    const params: any[] = [];

    if (!isStaff) {
      params.push(req.user!.id);
      sql += ` AND student_id = $${params.length}`;
    } else if (studentId) {
      params.push(studentId);
      sql += ` AND student_id = $${params.length}`;
    }

    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await db.query(sql, params);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

// PATCH /api/v1/print-requests/:id/status - Update print request status (Admin/Librarian)
router.patch('/:id/status', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const validStatuses = ['pending', 'approved_printing', 'ready_for_pickup', 'completed', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'حالة الطلب غير صالحة.' },
      });
    }

    const completedAtSql = status === 'completed' ? 'completed_at = CURRENT_TIMESTAMP,' : '';

    const query = `
      UPDATE print_requests
      SET status = $1,
          admin_notes = COALESCE($2, admin_notes),
          ${completedAtSql}
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

    const { rows } = await db.query(query, [status, adminNotes || null, id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'طلب الطباعة غير موجود.' },
      });
    }

    const updated = rows[0];

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'UPDATE_PRINT_REQUEST_STATUS',
      'print_requests',
      id,
      { status, adminNotes },
      req
    );

    res.json({
      success: true,
      data: updated,
      message: 'تم تحديث حالة طلب الطباعة بنجاح.',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

// DELETE /api/v1/print-requests/:id - Cancel or delete a print request
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const isStaff = req.user!.role === 'admin' || req.user!.role === 'librarian';

    const { rows } = await db.query('SELECT * FROM print_requests WHERE id = $1 LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'طلب الطباعة غير موجود.' },
      });
    }

    const requestItem = rows[0];

    // If student, can only cancel their own pending request
    if (!isStaff) {
      if (requestItem.student_id !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'غير مصرح لك بإلغاء هذا الطلب.' },
        });
      }
      if (requestItem.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: { code: 'CANNOT_CANCEL', message: 'لا يمكن إلغاء الطلب بعد اعتماده أو بدء معالجته.' },
        });
      }
    }

    await db.query('DELETE FROM print_requests WHERE id = $1', [id]);

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'DELETE_PRINT_REQUEST',
      'print_requests',
      id,
      { requestItem },
      req
    );

    res.json({
      success: true,
      message: 'تم حذف طلب الطباعة بنجاح.',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

export default router;
