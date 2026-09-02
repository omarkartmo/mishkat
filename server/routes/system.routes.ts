import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/pool';
import { serverConfig } from '../config';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';
import { seedInitialData } from '../db/seed';

import {
  createDatabaseBackup,
  validateBackupPayload,
  restoreDatabaseFromBackup,
  BackupData,
} from '../services/backupService';
import { logger } from '../utils/logger';

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

// POST /api/v1/backups/create (Admin only manual backup)
backupRouter.post('/create', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { fileName, tablesCount, data } = await createDatabaseBackup(req.user!.name, 'manual');

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'CREATE_BACKUP',
      'system',
      fileName,
      null,
      req
    );

    res.json({
      success: true,
      data: {
        message: 'تم إنشاء النسخة الاحتياطية بنجاح على الخادم المركزي.',
        fileName,
        createdAt: data.meta.exportedAt,
        tablesCount,
        backup: data,
      },
    });
  } catch (err: any) {
    logger.error(`[Backup] Creation failed: ${err.message}`);
    res.status(500).json({ success: false, error: { code: 'BACKUP_FAILED', message: err.message } });
  }
});

// GET /api/v1/backups (Admin only list backups with classification)
backupRouter.get('/', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(serverConfig.dirs.backups)) {
      return res.json({ success: true, data: [] });
    }

    const files = fs.readdirSync(serverConfig.dirs.backups)
      .filter((f) => f.endsWith('.json'))
      .map((fileName) => {
        const stats = fs.statSync(path.join(serverConfig.dirs.backups, fileName));
        const isPreRestore = fileName.startsWith('mishkat_pre_restore_');
        return {
          fileName,
          type: isPreRestore ? 'pre_restore' : 'manual',
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
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBackups = path.resolve(serverConfig.dirs.backups);
  const relative = path.relative(resolvedBackups, resolvedTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(resolvedTarget)) {
    return res.status(404).json({ success: false, error: { code: 'BACKUP_NOT_FOUND', message: 'ملف النسخة الاحتياطية غير موجود.' } });
  }

  res.download(resolvedTarget, safeFileName);
});

// POST /api/v1/backups/:fileName/restore (Admin only with validation, pre-restore safety backup, and atomic rollback)
backupRouter.post('/:fileName/restore', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const safeFileName = path.basename(req.params.fileName);
  if (!safeFileName.endsWith('.json')) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_FILE_TYPE', message: 'يُسمح فقط بملفات النسخ الاحتياطية بتنسيق JSON (.json).' },
    });
  }

  const targetPath = path.join(serverConfig.dirs.backups, safeFileName);
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBackups = path.resolve(serverConfig.dirs.backups);
  const relative = path.relative(resolvedBackups, resolvedTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(resolvedTarget)) {
    return res.status(404).json({
      success: false,
      error: { code: 'BACKUP_NOT_FOUND', message: 'ملف النسخة الاحتياطية غير موجود على الخادم المركزي.' },
    });
  }

  // 1. Mandatory confirmation check
  const { confirm } = req.body || {};
  if (!confirm) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: 'يرجى تأكيد طلب استرجاع قاعدة البيانات صراحة (confirm: true). استرجاع النسخة الاحتياطية سيستبدل البيانات الحالية.',
      },
    });
  }

  // 2. Read and parse file
  let parsedBackup: any;
  try {
    const rawContent = fs.readFileSync(resolvedTarget, 'utf8');
    parsedBackup = JSON.parse(rawContent);
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_BACKUP_FILE',
        message: 'تعذر قراءة ملف النسخة الاحتياطية (تنسيق JSON تالف أو غير صالح).',
      },
    });
  }

  // 3. Comprehensive structural & constraint validation before touching database
  const validation = validateBackupPayload(parsedBackup);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_BACKUP_SCHEMA',
        message: `ملف النسخة الاحتياطية غير متوافق: ${validation.error}`,
      },
    });
  }

  // 4. Create pre-restore safety backup of CURRENT database state
  let preRestoreFileName: string | null = null;
  try {
    const safetyBackup = await createDatabaseBackup(req.user!.name, 'pre_restore');
    preRestoreFileName = safetyBackup.fileName;
    logger.info(`[Backup] Pre-restore safety backup created: ${preRestoreFileName}`);
  } catch (safetyErr: any) {
    logger.error(`[Backup] Failed to create pre-restore safety backup: ${safetyErr.message}`);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SAFETY_BACKUP_FAILED',
        message: 'تعذر إنشاء نسخة الأمان الاحتياطية قبل الاسترجاع. تم إيقاف عملية الاسترجاع حماية للبيانات.',
      },
    });
  }

  // 5. Perform atomic transactional restore
  try {
    const result = await db.transaction(async (client) => {
      return await restoreDatabaseFromBackup(parsedBackup as BackupData, client);
    });

    logger.info(`[Backup] Database restored successfully from ${safeFileName}`, {
      restoredBy: req.user!.name,
      preRestoreBackup: preRestoreFileName,
      counts: result.restoredCounts,
    });

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'RESTORE_DATABASE',
      'system',
      safeFileName,
      {
        backupFileName: safeFileName,
        preRestoreBackup: preRestoreFileName,
        restoredCounts: result.restoredCounts,
      },
      req
    );

    res.json({
      success: true,
      data: {
        message: 'تم استرجاع قاعدة البيانات المركزية بنجاح واستعادة كافة السجلات.',
        backupFileName: safeFileName,
        preRestoreBackup: preRestoreFileName,
        restoredCounts: result.restoredCounts,
      },
    });
  } catch (restoreErr: any) {
    logger.error(`[Backup] Database restore failed and was rolled back: ${restoreErr.message}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'RESTORE_FAILED',
        message: `فشلت عملية استرجاع قاعدة البيانات وتم إلغاء التغييرات تلقائياً (Rollback): ${restoreErr.message}`,
      },
    });
  }
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
  let dbStatus = 'disconnected';
  let storageStatus = 'inaccessible';

  // 1. Verify Storage Read/Write accessibility
  try {
    if (fs.existsSync(serverConfig.dirs.root)) {
      fs.accessSync(serverConfig.dirs.root, fs.constants.R_OK | fs.constants.W_OK);
      storageStatus = 'writable';
    }
  } catch {
    storageStatus = 'error';
  }

  // 2. Verify Database connectivity and responsiveness
  try {
    const isPg = db.isPgConnected();
    const { rows: bookCount } = await db.query('SELECT count(*) as count FROM books');
    const { rows: userCount } = await db.query('SELECT count(*) as count FROM users');
    const { rows: loanCount } = await db.query("SELECT count(*) as count FROM loans WHERE status = 'active'");
    dbStatus = isPg ? 'connected' : 'embedded_wal_connected';

    const isHealthy = storageStatus === 'writable';
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: isHealthy,
      data: {
        status: isHealthy ? 'healthy' : 'degraded',
        checks: {
          process: 'alive',
          database: dbStatus,
          storage: storageStatus,
        },
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
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNHEALTHY',
        message: 'تعذر التحقق من سلامة الخادم أو قاعدة البيانات المركزية.',
      },
      data: {
        status: 'unhealthy',
        checks: {
          process: 'alive',
          database: 'error',
          storage: storageStatus,
        },
        serverTime: new Date().toISOString(),
      },
    });
  }
});

