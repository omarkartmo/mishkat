import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// GET /api/v1/notifications
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    const { rows } = await db.query(
      `SELECT * FROM notifications
       WHERE recipient_id = $1 OR recipient_id = 'all' OR (recipient_role = $2 AND recipient_id = $2)
       ORDER BY created_timestamp DESC LIMIT 50`,
      [userId, userRole]
    );

    const formatted = rows.map((n) => ({
      id: n.id,
      recipientId: n.recipient_id,
      recipientRole: n.recipient_role,
      title: n.title,
      message: n.message,
      type: n.type,
      targetTab: n.target_tab,
      targetEntityId: n.target_entity_id,
      isRead: n.is_read || false,
      createdAt: n.created_at,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/notifications/:id/read
router.post('/:id/read', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
    res.json({ success: true, data: { isRead: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/notifications/mark-all-read
router.post('/mark-all-read', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    await db.query(
      "UPDATE notifications SET is_read = true WHERE recipient_id = $1 OR (recipient_role = $2 AND recipient_id = $2)",
      [userId, userRole]
    );
    res.json({ success: true, data: { markedAllRead: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
