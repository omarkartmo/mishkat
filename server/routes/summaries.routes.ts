import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { recordAuditLog } from '../middleware/audit';

const router = Router();

// GET /api/v1/summaries
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { studentId } = req.query;
    let sql = 'SELECT * FROM book_summaries WHERE 1=1';
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

    const formatted = rows.map((s) => ({
      id: s.id,
      studentId: s.student_id,
      bookId: s.book_id,
      bookTitle: s.book_title,
      bookAuthor: s.book_author,
      bookMedium: s.book_medium,
      title: s.title,
      structureType: s.structure_type,
      mainIdea: s.main_idea,
      keyTakeaways: Array.isArray(s.key_takeaways) ? s.key_takeaways : [],
      chaptersSummaries: typeof s.chapters_summaries === 'string' ? JSON.parse(s.chapters_summaries) : (s.chapters_summaries || []),
      favoriteQuotes: typeof s.favorite_quotes === 'string' ? JSON.parse(s.favorite_quotes) : (s.favorite_quotes || []),
      actionableInsights: Array.isArray(s.actionable_insights) ? s.actionable_insights : [],
      tags: Array.isArray(s.tags) ? s.tags : [],
      rating: s.rating || 5,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/summaries
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const summary = req.body;
  const id = summary.id || `sum-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const studentId = req.user!.role === 'student' ? req.user!.id : (summary.studentId || req.user!.id);
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);

  try {
    await db.query(`
      INSERT INTO book_summaries (
        id, student_id, book_id, book_title, book_author, book_medium, title,
        structure_type, main_idea, key_takeaways, chapters_summaries,
        favorite_quotes, actionable_insights, tags, rating, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        structure_type = EXCLUDED.structure_type,
        main_idea = EXCLUDED.main_idea,
        key_takeaways = EXCLUDED.key_takeaways,
        chapters_summaries = EXCLUDED.chapters_summaries,
        favorite_quotes = EXCLUDED.favorite_quotes,
        actionable_insights = EXCLUDED.actionable_insights,
        tags = EXCLUDED.tags,
        rating = EXCLUDED.rating,
        updated_at = $16;
    `, [
      id,
      studentId,
      summary.bookId,
      summary.bookTitle,
      summary.bookAuthor || 'غير محدد',
      summary.bookMedium || 'digital',
      summary.title || 'ملخص كتاب',
      summary.structureType || 'structured',
      summary.mainIdea || '',
      summary.keyTakeaways || [],
      JSON.stringify(summary.chaptersSummaries || []),
      JSON.stringify(summary.favoriteQuotes || []),
      summary.actionableInsights || [],
      summary.tags || [],
      summary.rating || 5,
      nowStr,
    ]);

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'SAVE_SUMMARY', 'summary', id, { title: summary.title }, req);

    res.status(201).json({
      success: true,
      data: { id, studentId, ...summary, createdAt: nowStr },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/summaries/:id
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    if (req.user!.role === 'student') {
      await db.query('DELETE FROM book_summaries WHERE id = $1 AND student_id = $2', [id, req.user!.id]);
    } else {
      await db.query('DELETE FROM book_summaries WHERE id = $1', [id]);
    }
    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'DELETE_SUMMARY', 'summary', id, null, req);
    res.json({ success: true, data: { message: 'تم حذف الملخص بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
