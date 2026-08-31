import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// GET /api/v1/notes
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { studentId } = req.query;
    let sql = 'SELECT * FROM student_notes WHERE 1=1';
    const params: any[] = [];

    if (req.user!.role === 'student') {
      params.push(req.user!.id);
      sql += ` AND student_id = $${params.length}`;
    } else if (studentId) {
      params.push(studentId);
      sql += ` AND student_id = $${params.length}`;
    }

    sql += ' ORDER BY created_timestamp DESC';

    const { rows } = await db.query(sql, params);

    const formatted = rows.map((n) => ({
      id: n.id,
      studentId: n.student_id,
      bookId: n.book_id,
      bookTitle: n.book_title,
      bookMedium: n.book_medium,
      pageNumber: n.page_number,
      chapter: n.chapter,
      quote: n.quote,
      content: n.content,
      colorTag: n.color_tag,
      category: n.category,
      tags: Array.isArray(n.tags) ? n.tags : [],
      createdAt: n.created_at,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/notes
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const note = req.body;
  const id = note.id || `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const studentId = req.user!.role === 'student' ? req.user!.id : (note.studentId || req.user!.id);
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);

  try {
    await db.query(`
      INSERT INTO student_notes (
        id, student_id, book_id, book_title, book_medium, page_number,
        chapter, quote, content, color_tag, category, tags, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        quote = EXCLUDED.quote,
        page_number = EXCLUDED.page_number,
        chapter = EXCLUDED.chapter,
        color_tag = EXCLUDED.color_tag,
        category = EXCLUDED.category,
        tags = EXCLUDED.tags;
    `, [
      id,
      studentId,
      note.bookId,
      note.bookTitle,
      note.bookMedium || 'digital',
      note.pageNumber || 1,
      note.chapter || null,
      note.quote || null,
      note.content,
      note.colorTag || 'amber',
      note.category || 'فائدة فقهية',
      note.tags || [],
      nowStr,
    ]);

    res.status(201).json({
      success: true,
      data: { id, studentId, ...note, createdAt: nowStr },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/notes/:id
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    if (req.user!.role === 'student') {
      await db.query('DELETE FROM student_notes WHERE id = $1 AND student_id = $2', [id, req.user!.id]);
    } else {
      await db.query('DELETE FROM student_notes WHERE id = $1', [id]);
    }
    res.json({ success: true, data: { message: 'تم حذف الفائدة بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
