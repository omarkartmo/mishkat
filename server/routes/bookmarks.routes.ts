import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// GET /api/v1/bookmarks
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { studentId } = req.query;
    let sql = 'SELECT * FROM physical_bookmarks WHERE 1=1';
    const params: any[] = [];

    if (req.user!.role === 'student') {
      params.push(req.user!.id);
      sql += ` AND student_id = $${params.length}`;
    } else if (studentId) {
      params.push(studentId);
      sql += ` AND student_id = $${params.length}`;
    }

    sql += ' ORDER BY updated_at DESC';

    const { rows } = await db.query(sql, params);

    const formatted = rows.map((b) => ({
      id: b.id,
      studentId: b.student_id,
      bookId: b.book_id,
      bookTitle: b.book_title,
      bookAuthor: b.book_author,
      bookLocation: {
        cabinet: b.cabinet || '',
        shelf: b.shelf || '',
        section: b.section || '',
      },
      currentPage: b.current_page,
      totalPages: b.total_pages,
      chapterOrTopic: b.chapter_or_topic,
      lastSessionDate: b.last_session_date,
      quickNote: b.quick_note,
      isCompleted: b.is_completed || false,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/bookmarks (Upsert bookmark)
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const bookmark = req.body;
  const id = bookmark.id || `bm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const studentId = req.user!.role === 'student' ? req.user!.id : (bookmark.studentId || req.user!.id);
  const sessionDate = bookmark.lastSessionDate || new Date().toISOString().split('T')[0];

  try {
    await db.query(`
      INSERT INTO physical_bookmarks (
        id, student_id, book_id, book_title, book_author, cabinet, shelf, section,
        current_page, total_pages, chapter_or_topic, last_session_date, quick_note, is_completed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        current_page = EXCLUDED.current_page,
        chapter_or_topic = EXCLUDED.chapter_or_topic,
        last_session_date = EXCLUDED.last_session_date,
        quick_note = EXCLUDED.quick_note,
        is_completed = EXCLUDED.is_completed;
    `, [
      id,
      studentId,
      bookmark.bookId,
      bookmark.bookTitle,
      bookmark.bookAuthor || '',
      bookmark.bookLocation?.cabinet || '',
      bookmark.bookLocation?.shelf || '',
      bookmark.bookLocation?.section || '',
      bookmark.currentPage || 1,
      bookmark.totalPages || 100,
      bookmark.chapterOrTopic || null,
      sessionDate,
      bookmark.quickNote || null,
      bookmark.isCompleted || false,
    ]);

    res.status(201).json({
      success: true,
      data: { id, studentId, ...bookmark, lastSessionDate: sessionDate },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/bookmarks/:id
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    if (req.user!.role === 'student') {
      await db.query('DELETE FROM physical_bookmarks WHERE id = $1 AND student_id = $2', [id, req.user!.id]);
    } else {
      await db.query('DELETE FROM physical_bookmarks WHERE id = $1', [id]);
    }
    res.json({ success: true, data: { message: 'تم حذف الفاصل بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
