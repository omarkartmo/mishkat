import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/pool';
import { serverConfig } from '../config';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';
import { seedInitialData } from '../db/seed';

export const auditRouter = Router();

// GET /api/v1/audit-logs
auditRouter.get('/', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { limit = 100 } = req.query;
    const { rows } = await db.query(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1',
      [Number(limit)]
    );

    const formatted = rows.map((a) => ({
      id: a.id,
      userId: a.user_id,
      userName: a.user_name,
      userRole: a.user_role,
      action: a.action,
      entityType: a.entity_type,
      entityId: a.entity_id,
      metadata: typeof a.metadata === 'string' ? JSON.parse(a.metadata) : a.metadata,
      ipAddress: a.ip_address,
      createdAt: a.created_at,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export const backupRouter = Router();

// POST /api/v1/backups/create
backupRouter.post('/create', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `mishkat_backup_${timestamp}.json`;
    const backupFilePath = path.join(serverConfig.dirs.backups, backupFileName);

    // Export all tables
    const tables = [
      'users', 'categories', 'books', 'physical_copies', 'loans',
      'loan_requests', 'reading_progress', 'physical_bookmarks',
      'book_summaries', 'student_notes', 'student_favorites',
      'pending_submissions', 'whitelisted_portals', 'system_settings'
    ];

    const backupDump: Record<string, any> = {
      meta: {
        exportedAt: new Date().toISOString(),
        exportedBy: req.user!.name,
        version: '1.0.0',
      },
      data: {},
    };

    for (const table of tables) {
      const { rows } = await db.query(`SELECT * FROM ${table}`);
      backupDump.data[table] = rows;
    }

    if (!fs.existsSync(serverConfig.dirs.backups)) {
      fs.mkdirSync(serverConfig.dirs.backups, { recursive: true });
    }

    fs.writeFileSync(backupFilePath, JSON.stringify(backupDump, null, 2), 'utf8');

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'CREATE_BACKUP', 'system', backupFileName, null, req);

    res.json({
      success: true,
      data: {
        message: 'تم إنشاء النسخة الاحتياطية بنجاح على الخادم المركزي.',
        fileName: backupFileName,
        createdAt: new Date().toISOString(),
        tablesCount: tables.length,
        backup: backupDump,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'BACKUP_FAILED', message: err.message } });
  }
});

// GET /api/v1/backups
backupRouter.get('/', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(serverConfig.dirs.backups)) {
      return res.json({ success: true, data: [] });
    }

    const files = fs.readdirSync(serverConfig.dirs.backups)
      .filter((f) => f.endsWith('.json'))
      .map((fileName) => {
        const stats = fs.statSync(path.join(serverConfig.dirs.backups, fileName));
        return {
          fileName,
          sizeBytes: stats.size,
          sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
          createdAt: stats.birthtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({ success: true, data: files });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/v1/backups/:fileName/download (Admin only download with Traversal Guard)
backupRouter.get('/:fileName/download', authenticateToken, requireRole('admin'), (req: Request, res: Response) => {
  const safeFileName = path.basename(req.params.fileName);
  const targetPath = path.join(serverConfig.dirs.backups, safeFileName);
  const resolvedPath = path.resolve(targetPath);
  const backupsDir = path.resolve(serverConfig.dirs.backups);

  if (!resolvedPath.startsWith(backupsDir) || !fs.existsSync(resolvedPath)) {
    return res.status(404).json({ success: false, error: { code: 'BACKUP_NOT_FOUND', message: 'ملف النسخة الاحتياطية غير موجود.' } });
  }

  res.download(resolvedPath, safeFileName);
});

export const systemRouter = Router();

// POST /api/v1/system/reset-demo (Admin only with explicit confirmation)
systemRouter.post('/reset-demo', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { confirm } = req.body || {};
  if (!confirm) {
    return res.status(400).json({
      success: false,
      error: { code: 'CONFIRMATION_REQUIRED', message: 'يرجى تأكيد طلب إعادة تعيين قاعدة البيانات.' },
    });
  }

  try {
    await db.transaction(async (client) => {
      await client.query(`
        TRUNCATE TABLE
          student_notes,
          book_summaries,
          physical_bookmarks,
          reading_progress,
          student_favorites,
          notifications,
          loans,
          loan_requests,
          pending_submissions,
          whitelisted_portals,
          physical_copies,
          books,
          categories,
          users,
          system_settings
        CASCADE;
      `);
    });

    await seedInitialData();

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'RESET_SYSTEM_DATABASE',
      'system',
      null,
      { confirmedBy: req.user!.name },
      req
    );

    res.json({
      success: true,
      data: { message: 'تمت إعادة تعيين قاعدة البيانات المركزية واسترجاع البيانات النموذجية بنجاح.' },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'RESET_FAILED', message: err.message } });
  }
});

export const healthRouter = Router();

// GET /api/v1/health
healthRouter.get('/', async (req: Request, res: Response) => {
  try {
    const isPg = db.isPgConnected();
    const { rows: bookCount } = await db.query('SELECT count(*) as count FROM books');
    const { rows: userCount } = await db.query('SELECT count(*) as count FROM users');
    const { rows: loanCount } = await db.query("SELECT count(*) as count FROM loans WHERE status = 'active'");

    res.json({
      success: true,
      data: {
        status: 'healthy',
        serverTime: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        databaseEngine: isPg ? 'PostgreSQL Central Pool' : 'Relational Engine with WAL',
        storagePaths: {
          centralDirectory: serverConfig.dirs.root,
          booksStorage: serverConfig.dirs.books,
          backupsStorage: serverConfig.dirs.backups,
        },
        counts: {
          books: parseInt(bookCount[0]?.count || '0', 10),
          users: parseInt(userCount[0]?.count || '0', 10),
          activeLoans: parseInt(loanCount[0]?.count || '0', 10),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'HEALTH_CHECK_FAILED', message: err.message } });
  }
});

