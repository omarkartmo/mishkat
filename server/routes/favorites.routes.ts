import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// GET /api/v1/favorites
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.id;
    const { rows } = await db.query(
      'SELECT book_id FROM student_favorites WHERE student_id = $1',
      [studentId]
    );
    const bookIds = rows.map((r) => r.book_id);
    res.json({ success: true, data: bookIds });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/favorites/toggle
router.post('/toggle', authenticateToken, async (req: Request, res: Response) => {
  const { bookId } = req.body;
  const studentId = req.user!.id;

  if (!bookId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'معرف الكتاب مطلوب.' } });
  }

  try {
    const { rows } = await db.query(
      'SELECT id FROM student_favorites WHERE student_id = $1 AND book_id = $2',
      [studentId, bookId]
    );

    let isFavorited = false;
    if (rows.length > 0) {
      await db.query('DELETE FROM student_favorites WHERE student_id = $1 AND book_id = $2', [studentId, bookId]);
      isFavorited = false;
    } else {
      const id = `fav-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      await db.query(
        'INSERT INTO student_favorites (id, student_id, book_id) VALUES ($1, $2, $3)',
        [id, studentId, bookId]
      );
      isFavorited = true;
    }

    res.json({ success: true, data: { isFavorited, bookId } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/favorites/:bookId
router.delete('/:bookId', authenticateToken, async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const studentId = req.user!.id;
  try {
    await db.query('DELETE FROM student_favorites WHERE student_id = $1 AND book_id = $2', [studentId, bookId]);
    res.json({ success: true, data: { removed: true, bookId } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
