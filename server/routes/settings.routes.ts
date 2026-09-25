import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';
import { INITIAL_SYSTEM_CONFIG } from '../../src/data/initialData';
import { isSystemDangerousPath } from '../utils/pathSafety';

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
    console.error('Error fetching settings:', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'حدث خطأ أثناء جلب إعدادات النظام' } });
  }
});

// PUT /api/v1/settings (Admin only with strict validation)
router.put('/', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const newConfig = req.body;

  if (!newConfig || typeof newConfig !== 'object' || Array.isArray(newConfig)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PAYLOAD', message: 'بيانات الإعدادات غير صالحة.' },
    });
  }

  // Validate digitalBookRootUrl
  if (newConfig.digitalBookRootUrl && typeof newConfig.digitalBookRootUrl === 'string' && newConfig.digitalBookRootUrl.trim()) {
    if (isSystemDangerousPath(newConfig.digitalBookRootUrl)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ROOT_PATH', message: 'مسار مستودع الكتب الرقمية غير صالح أو يشير إلى مجلد نظام حساس ومحظور.' },
      });
    }
  }

  // Validate allowedRoots
  if (newConfig.allowedRoots !== undefined) {
    if (!Array.isArray(newConfig.allowedRoots)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CONFIG', message: 'قائمة المسارات الإضافية يجب أن تكون مصفوفة صالحة.' },
      });
    }
    for (const r of newConfig.allowedRoots) {
      if (typeof r !== 'string' || !r.trim() || isSystemDangerousPath(r)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ROOT_PATH', message: 'أحد المسارات المحددة في قائمة المسارات الإضافية يشير إلى مجلد نظام حساس أو غير صالح.' },
        });
      }
    }
  }

  // Validate loan constraints if supplied
  if (newConfig.generalReadingDurationDays !== undefined) {
    const val = Number(newConfig.generalReadingDurationDays);
    if (isNaN(val) || val < 1 || val > 365) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CONFIG', message: 'مدة إعارة المطالعة العامة يجب أن تكون بين 1 و 365 يوماً.' } });
    }
  }

  if (newConfig.academicResearchDurationDays !== undefined) {
    const val = Number(newConfig.academicResearchDurationDays);
    if (isNaN(val) || val < 1 || val > 365) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CONFIG', message: 'مدة إعارة البحث الأكاديمي يجب أن تكون بين 1 و 365 يوماً.' } });
    }
  }

  if (newConfig.maxActiveLoansPerStudent !== undefined) {
    const val = Number(newConfig.maxActiveLoansPerStudent);
    if (isNaN(val) || val < 1 || val > 50) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CONFIG', message: 'الحد الأقصى للإعارات النشطة لكل طالب يجب أن يكون بين 1 و 50 كتاباً.' } });
    }
  }

  if (newConfig.maxExtensionsAllowed !== undefined) {
    const val = Number(newConfig.maxExtensionsAllowed);
    if (isNaN(val) || val < 0 || val > 20) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CONFIG', message: 'الحد الأقصى لمرات التمديد يجب أن يكون بين 0 و 20.' } });
    }
  }

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
    console.error('Error updating settings:', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'حدث خطأ أثناء حفظ الإعدادات' } });
  }
});

// POST /api/v1/settings/test-gemini (Admin: Test Gemini AI OCR API key connectivity)
router.post('/test-gemini', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    const { testGeminiConnection } = await import('../services/bookAiService');
    const result = await testGeminiConnection(apiKey);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `خطأ في الخادم أثناء فحص الاتصال: ${err.message}` });
  }
});

export default router;
