import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';
import { INITIAL_SYSTEM_CONFIG } from '../../src/data/initialData';

const router = Router();

// GET /api/v1/settings
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query("SELECT value FROM system_settings WHERE key = 'library_config' LIMIT 1");
    if (rows.length > 0) {
      const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      return res.json({ success: true, data: val });
    }
    res.json({ success: true, data: INITIAL_SYSTEM_CONFIG });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PUT /api/v1/settings (Admin only)
router.put('/', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const newConfig = req.body;
  try {
    await db.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('library_config', $1, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP;
    `, [JSON.stringify(newConfig)]);

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'UPDATE_SETTINGS', 'system_settings', 'library_config', newConfig, req);

    res.json({ success: true, data: { message: 'تم حفظ إعدادات النظام في الخادم المركزي بنجاح.', config: newConfig } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
