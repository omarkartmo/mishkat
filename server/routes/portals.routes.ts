import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = Router();

// GET /api/v1/portals
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query('SELECT * FROM whitelisted_portals ORDER BY is_featured DESC, name ASC');
    const formatted = rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      url: p.url,
      category: p.category,
      icon: p.icon,
      isFeatured: p.is_featured,
      notes: p.notes,
      allowedDomains: Array.isArray(p.allowed_domains) ? p.allowed_domains : [],
    }));
    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/portals
router.post('/', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { name, description, url, category, icon = 'Globe', isFeatured = true, notes, allowedDomains = [] } = req.body;
  const id = `portal-${Date.now()}`;

  try {
    await db.query(`
      INSERT INTO whitelisted_portals (id, name, description, url, category, icon, is_featured, notes, allowed_domains)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [id, name, description || '', url, category, icon, isFeatured, notes || null, allowedDomains]);

    res.status(201).json({ success: true, data: { id, name, description, url, category, icon, isFeatured, notes, allowedDomains } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PUT /api/v1/portals/:id
router.put('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, url, category, icon, isFeatured, notes, allowedDomains } = req.body;

  try {
    await db.query(`
      UPDATE whitelisted_portals SET
        name = $1, description = $2, url = $3, category = $4, icon = $5,
        is_featured = $6, notes = $7, allowed_domains = $8
      WHERE id = $9
    `, [name, description, url, category, icon, isFeatured, notes, allowedDomains, id]);

    res.json({ success: true, data: { message: 'تم تحديث بوابة المكتبة بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/portals/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM whitelisted_portals WHERE id = $1', [id]);
    res.json({ success: true, data: { message: 'تم حذف البوابة بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
