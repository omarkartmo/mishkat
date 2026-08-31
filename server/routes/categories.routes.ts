import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = Router();

// GET /api/v1/categories
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query('SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC');
    const formatted = rows.map((c) => ({
      id: c.id,
      name: c.name,
      nameEn: c.name_en,
      description: c.description,
      color: c.color,
      iconName: c.icon_name,
    }));
    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/categories (Admin only)
router.post('/', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { name, nameEn, description, color = '#4f46e5', iconName = 'BookOpen' } = req.body;
  const id = `cat-${Date.now()}`;

  try {
    await db.query(`
      INSERT INTO categories (id, name, name_en, description, color, icon_name)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, name, nameEn || null, description || '', color, iconName]);

    res.status(201).json({ success: true, data: { id, name, nameEn, description, color, iconName } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PUT /api/v1/categories/:id
router.put('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, nameEn, description, color, iconName } = req.body;

  try {
    await db.query(`
      UPDATE categories SET
        name = $1, name_en = $2, description = $3, color = $4, icon_name = $5
      WHERE id = $6
    `, [name, nameEn || null, description, color, iconName, id]);

    res.json({ success: true, data: { message: 'تم تحديث التصنيف بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/categories/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { targetCategoryId = 'cat-general' } = req.body || {};
  try {
    await db.transaction(async (client) => {
      await client.query('UPDATE books SET category_id = $1 WHERE category_id = $2', [targetCategoryId, id]);
      await client.query('DELETE FROM categories WHERE id = $1', [id]);
    });
    res.json({ success: true, data: { message: 'تم حذف التصنيف وإعادة تعيين الكتب بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/categories/:id/reassign-delete
router.post('/:id/reassign-delete', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { targetCategoryId = 'cat-general' } = req.body;
  try {
    await db.transaction(async (client) => {
      await client.query('UPDATE books SET category_id = $1 WHERE category_id = $2', [targetCategoryId, id]);
      await client.query('DELETE FROM categories WHERE id = $1', [id]);
    });
    res.json({ success: true, data: { message: 'تم حذف التصنيف وإعادة تعيين الكتب بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
