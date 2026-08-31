import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';

const router = Router();

// GET /api/v1/submissions
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    let sql = 'SELECT * FROM pending_submissions WHERE 1=1';
    const params: any[] = [];

    if (req.user!.role === 'student') {
      params.push(req.user!.id);
      sql += ` AND student_id = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await db.query(sql, params);

    const formatted = rows.map((s) => ({
      id: s.id,
      title: s.title,
      author: s.author,
      suggestedCategoryId: s.suggested_category_id,
      format: s.format,
      sourceUrl: s.source_url,
      sourcePortalName: s.source_portal_name,
      summary: s.summary,
      studentId: s.student_id,
      studentName: s.student_name,
      studentRegNumber: s.student_reg_number,
      submittedAt: s.submitted_at,
      status: s.status,
      adminFeedback: s.admin_feedback,
      reviewedAt: s.reviewed_at,
      pagesEstimated: s.pages_estimated,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/submissions (Student submits research document/book)
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const { title, author, suggestedCategoryId, sourceUrl, sourcePortalName, summary, format = 'pdf', pagesEstimated = 50 } = req.body;

  if (!title || !author || !sourcePortalName) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'عنوان الكتاب، واسم المؤلف، واسم البوابة الأكاديمية مطلوبة.' },
    });
  }

  try {
    const id = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const submittedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

    await db.query(`
      INSERT INTO pending_submissions (
        id, title, author, suggested_category_id, format, source_url, source_portal_name,
        summary, student_id, student_name, student_reg_number, submitted_at, status, pages_estimated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13)
    `, [
      id,
      title,
      author,
      suggestedCategoryId || 'cat-general',
      format,
      sourceUrl || '',
      sourcePortalName,
      summary || '',
      req.user!.id,
      req.user!.name,
      req.user!.registrationNumber,
      submittedAt,
      pagesEstimated,
    ]);

    // Send admin notification
    await db.query(`
      INSERT INTO notifications (
        id, recipient_id, recipient_role, title, message, type, target_tab, target_entity_id, is_read, created_at
      ) VALUES ($1, 'admin', 'admin', $2, $3, 'book_submitted', 'repository', $4, false, $5)
    `, [
      `notif-${Date.now()}`,
      'اقتراح كتاب رقمي جديد',
      `اقترح الطالب ${req.user!.name} إضافة كتاب "${title}" من بوابة ${sourcePortalName}.`,
      id,
      submittedAt,
    ]);

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'SUBMIT_BOOK', 'submission', id, { title, sourcePortalName }, req);

    res.status(201).json({
      success: true,
      data: {
        id,
        title,
        author,
        suggestedCategoryId,
        format,
        sourceUrl,
        sourcePortalName,
        summary,
        studentId: req.user!.id,
        studentName: req.user!.name,
        studentRegNumber: req.user!.registrationNumber,
        submittedAt,
        status: 'pending',
        pagesEstimated,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/submissions/:id/review (Admin approves or rejects submission)
router.post('/:id/review', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, adminFeedback } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'الحالة غير صالحة.' } });
  }

  try {
    const reviewedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

    await db.transaction(async (client) => {
      const { rows: subRows } = await client.query('SELECT * FROM pending_submissions WHERE id = $1', [id]);
      if (subRows.length === 0) {
        throw new Error('الطلب غير موجود.');
      }
      const sub = subRows[0];

      // Update submission status
      await client.query(`
        UPDATE pending_submissions SET
          status = $1, admin_feedback = $2, reviewed_at = $3, reviewed_by = $4
        WHERE id = $5
      `, [status, adminFeedback || null, reviewedAt, req.user!.id, id]);

      // If approved, create Digital Book entry in master catalog
      if (status === 'approved') {
        const bookId = `dig-sub-${Date.now()}`;
        await client.query(`
          INSERT INTO books (
            id, type, title, author, category_id, format, file_size, file_url,
            pages_count, summary, source_origin, uploaded_by, tags, download_count, read_count
          ) VALUES ($1, 'digital', $2, $3, $4, $5, '2.1 MB', $6, $7, $8, $9, $10, ARRAY['مكتبة معتمدة', 'مُعتمد حديثاً'], 0, 0)
        `, [
          bookId,
          sub.title,
          sub.author,
          sub.suggested_category_id || 'cat-general',
          sub.format || 'pdf',
          sub.source_url || null,
          sub.pages_estimated || 100,
          sub.summary || '',
          sub.source_portal_name,
          sub.student_id,
        ]);
      }

      // Send student notification
      await client.query(`
        INSERT INTO notifications (
          id, recipient_id, recipient_role, title, message, type, target_tab, target_entity_id, is_read, created_at
        ) VALUES ($1, $2, 'student', $3, $4, $5, 'portals', $6, false, $7)
      `, [
        `notif-${Date.now()}`,
        sub.student_id,
        status === 'approved' ? 'تمت الموافقة على إضافة الكتاب' : 'تحديث بخصوص الكتاب المقترح',
        status === 'approved'
          ? `تم اعتماد كتاب "${sub.title}" وإضافته للمستودع الرقمي بالمكتبة.`
          : `نعتذر، لم تتم الموافقة على إضافة كتاب "${sub.title}". ${adminFeedback || ''}`,
        status === 'approved' ? 'book_approved' : 'book_rejected',
        id,
        reviewedAt,
      ]);
    });

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'REVIEW_SUBMISSION', 'submission', id, { status, adminFeedback }, req);

    res.json({ success: true, data: { message: `تم ${status === 'approved' ? 'اعتماد' : 'رفض'} الاقتراح بنجاح.` } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
