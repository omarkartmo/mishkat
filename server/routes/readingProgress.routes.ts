import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// GET /api/v1/reading-progress
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.role === 'student' ? req.user!.id : (req.query.studentId || req.user!.id);
    const { rows } = await db.query(
      'SELECT * FROM reading_progress WHERE student_id = $1 ORDER BY updated_at DESC',
      [studentId]
    );

    const formatted = rows.map((p) => ({
      id: p.id,
      studentId: p.student_id,
      bookId: p.book_id,
      currentPage: p.current_page,
      totalPages: p.total_pages,
      percentage: p.percentage,
      lastReadAt: p.last_read_at,
      isCompleted: p.is_completed || false,
      isDismissed: p.is_dismissed || false,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/reading-progress (Upsert progress)
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const { bookId, currentPage = 1, totalPages = 1, percentage = 0, isCompleted = false } = req.body;
  const studentId = req.user!.id;
  const id = `prog-${studentId}-${bookId}`;
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);

  try {
    await db.query(`
      INSERT INTO reading_progress (
        id, student_id, book_id, current_page, total_pages, percentage, last_read_at, is_completed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (student_id, book_id) DO UPDATE SET
        current_page = EXCLUDED.current_page,
        total_pages = EXCLUDED.total_pages,
        percentage = EXCLUDED.percentage,
        last_read_at = EXCLUDED.last_read_at,
        is_completed = EXCLUDED.is_completed;
    `, [id, studentId, bookId, currentPage, totalPages, percentage, nowStr, isCompleted]);

    res.json({
      success: true,
      data: {
        id,
        studentId,
        bookId,
        currentPage,
        totalPages,
        percentage,
        lastReadAt: nowStr,
        isCompleted,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/reading-progress/dismiss
router.post('/dismiss', authenticateToken, async (req: Request, res: Response) => {
  const { bookId } = req.body;
  const studentId = req.user!.id;
  try {
    await db.query(
      'UPDATE reading_progress SET is_dismissed = true WHERE student_id = $1 AND book_id = $2',
      [studentId, bookId]
    );
    res.json({ success: true, data: { dismissed: true, bookId } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/reading-progress/clear-completed
router.post('/clear-completed', authenticateToken, async (req: Request, res: Response) => {
  const studentId = req.user!.id;
  try {
    await db.query(
      'UPDATE reading_progress SET is_dismissed = true WHERE student_id = $1 AND is_completed = true',
      [studentId]
    );
    res.json({ success: true, data: { cleared: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/reading-progress/:bookId
router.delete('/:bookId', authenticateToken, async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const studentId = req.user!.id;
  try {
    await db.query('DELETE FROM reading_progress WHERE student_id = $1 AND book_id = $2', [studentId, bookId]);
    res.json({ success: true, data: { message: 'تم حذف سجل القراءة بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
