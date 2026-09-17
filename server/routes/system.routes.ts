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
  parseAndDecryptBackup,
  BackupData,
} from '../services/backupService';
import { googleDriveService } from '../services/googleDriveService';
import { backupScheduler } from '../services/backupScheduler';
import { generateInstitutionalExport } from '../services/exportService';
import { logger } from '../utils/logger';
import {
  getWatcherStatus,
  manualScanIncoming,
} from '../services/incomingWatcher';

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

// GET /api/v1/backups/status (Admin only overall backup status)
backupRouter.get('/status', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const status = await backupScheduler.getOverallStatus();
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/backups/create (Admin only backup with atomic local creation and Drive upload)
backupRouter.post('/create', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const cycle = await backupScheduler.runBackupCycle(req.user!.name);
    if (!cycle.localSuccess) {
      return res.status(500).json({
        success: false,
        error: { code: 'BACKUP_FAILED', message: cycle.error || 'فشل إنشاء النسخة الاحتياطية المحلية.' },
      });
    }

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'CREATE_BACKUP',
      'system',
      cycle.fileName!,
      {
        tablesCount: 16,
        encrypted: false,
        cloudSuccess: cycle.cloudSuccess,
        cloudStatus: cycle.cloudStatus,
      },
      req
    );

    res.json({
      success: true,
      data: {
        message: cycle.cloudSuccess
          ? 'تم إنشاء النسخة الاحتياطية محلياً ورفعها بنجاح إلى Google Drive.'
          : cycle.cloudStatus === 'waiting'
          ? 'تم إنشاء النسخة الاحتياطية محلياً بنجاح، وتأجل الرفع السحابي لإعادة المحاولة لاحقاً.'
          : 'تم إنشاء النسخة الاحتياطية بنجاح وحفظها محلياً.',
        fileName: cycle.fileName,
        localSuccess: true,
        cloudSuccess: cycle.cloudSuccess,
        cloudStatus: cycle.cloudStatus,
        tablesCount: 16,
        backup: cycle.data,
      },
    });
  } catch (err: any) {
    logger.error(`[Backup] Creation failed: ${err.message}`);
    res.status(500).json({ success: false, error: { code: 'BACKUP_FAILED', message: err.message } });
  }
});

// GET /api/v1/backups/drive/auth-url
backupRouter.get('/drive/auth-url', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    if (!googleDriveService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DRIVE_NOT_CONFIGURED',
          message: 'يرجى إعداد معرف العميل (Google Client ID) والسر أولاً.',
        },
      });
    }
    const url = googleDriveService.getAuthUrl();
    res.json({ success: true, data: { url } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'AUTH_URL_FAILED', message: err.message } });
  }
});

// POST /api/v1/backups/drive/config
backupRouter.post('/drive/config', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { clientId, clientSecret, redirectUri } = req.body || {};
    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'يرجى تزويد Client ID و Client Secret.' },
      });
    }
    googleDriveService.saveConfig({ clientId, clientSecret, redirectUri });
    res.json({ success: true, data: { message: 'تم حفظ إعدادات Google Drive بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'CONFIG_FAILED', message: err.message } });
  }
});

// POST /api/v1/backups/drive/connect
backupRouter.post('/drive/connect', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { code } = req.body || {};
    if (!code) {
      return res.status(400).json({
        success: false,
        error: { code: 'CODE_REQUIRED', message: 'رمز التفويض (code) مطلوب لإتمام الربط.' },
      });
    }
    await googleDriveService.exchangeCodeForTokens(code);
    await googleDriveService.ensureBackupsFolder();

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'CONNECT_GOOGLE_DRIVE',
      'system',
      'google_drive',
      { status: 'connected' },
      req
    );

    res.json({ success: true, data: { message: 'تم ربط حساب Google Drive بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'CONNECT_FAILED', message: err.message } });
  }
});

// POST /api/v1/backups/drive/disconnect
backupRouter.post('/drive/disconnect', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    googleDriveService.disconnect();

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'DISCONNECT_GOOGLE_DRIVE',
      'system',
      'google_drive',
      { status: 'disconnected' },
      req
    );

    res.json({ success: true, data: { message: 'تم إلغاء ربط Google Drive بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DISCONNECT_FAILED', message: err.message } });
  }
});

// GET /api/v1/backups/drive/backups
backupRouter.get('/drive/backups', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const backups = await googleDriveService.listCloudBackups();
    res.json({ success: true, data: backups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'LIST_DRIVE_BACKUPS_FAILED', message: err.message } });
  }
});

// POST /api/v1/backups/drive/retry
backupRouter.post('/drive/retry', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const success = await backupScheduler.retryPendingUpload();
    res.json({
      success: true,
      data: {
        retried: true,
        uploaded: success,
        message: success ? 'تم رفع النسخة المعلقة بنجاح إلى Google Drive.' : 'لم يتم الرفع أو لا توجد نسخ معلقة.',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'RETRY_FAILED', message: err.message } });
  }
});

// POST /api/v1/backups/drive/:fileId/restore
backupRouter.post('/drive/:fileId/restore', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { fileId } = req.params;
  const { confirm } = req.body || {};

  if (!confirm) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: 'يرجى تأكيد طلب استرجاع قاعدة البيانات صراحة (confirm: true).',
      },
    });
  }

  const tempRestoreFile = path.join(serverConfig.dirs.backups, `cloud_restore_${Date.now()}.json`);

  try {
    // 1. Download file from Google Drive
    await googleDriveService.downloadCloudBackup(fileId, tempRestoreFile);

    // 2. Read and parse/decrypt
    const rawContent = fs.readFileSync(tempRestoreFile, 'utf8');
    const { data: parsedBackup, isEncrypted } = parseAndDecryptBackup(rawContent);

    // 3. Validate backup payload
    const validation = validateBackupPayload(parsedBackup);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_BACKUP_SCHEMA',
          message: `ملف النسخة الاحتياطية السحابية غير متوافق: ${validation.error}`,
        },
      });
    }

    // 4. Create pre-restore safety backup
    const safetyBackup = await createDatabaseBackup(req.user!.name, 'pre_restore');

    // 5. Transactional restore with rollback
    const result = await db.transaction(async (client) => {
      return await restoreDatabaseFromBackup(parsedBackup, client);
    });

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'RESTORE_DATABASE',
      'system',
      fileId,
      {
        source: 'google_drive',
        preRestoreBackup: safetyBackup.fileName,
        restoredCounts: result.restoredCounts,
        isEncrypted,
      },
      req
    );

    res.json({
      success: true,
      data: {
        message: 'تم استرجاع قاعدة البيانات المركزية بنجاح من Google Drive واستعادة كافة السجلات.',
        fileId,
        preRestoreBackup: safetyBackup.fileName,
        restoredCounts: result.restoredCounts,
        isEncrypted,
      },
    });
  } catch (err: any) {
    logger.error(`[Backup] Cloud restore failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'RESTORE_FAILED',
        message: `فشلت عملية استرجاع النسخة السحابية وتم إلغاء التغييرات (Rollback): ${err.message}`,
      },
    });
  } finally {
    if (fs.existsSync(tempRestoreFile)) {
      try { fs.unlinkSync(tempRestoreFile); } catch {}
    }
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
        const fullPath = path.join(serverConfig.dirs.backups, fileName);
        const stats = fs.statSync(fullPath);
        const isPreRestore = fileName.startsWith('mishkat_pre_restore_');
        let isEncrypted = true;
        let tablesCount = 16;
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const parsed = JSON.parse(content);
          if (parsed.format === 'mishkat_encrypted_backup') {
            isEncrypted = true;
            tablesCount = parsed.meta?.tablesCount || 16;
          } else if (parsed.meta && parsed.data) {
            isEncrypted = false;
          }
        } catch {}

        return {
          fileName,
          type: isPreRestore ? 'pre_restore' : 'manual',
          isEncrypted,
          tablesCount,
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

  // 2. Read and parse/decrypt file
  let parsedBackup: any;
  let isEncrypted = false;
  try {
    const rawContent = fs.readFileSync(resolvedTarget, 'utf8');
    const decrypted = parseAndDecryptBackup(rawContent);
    parsedBackup = decrypted.data;
    isEncrypted = decrypted.isEncrypted;
  } catch (err: any) {
    const isCorruptedJson = err.message.includes('JSON');
    const isTampered =
      err.message.includes('Authentication Tag') ||
      err.message.includes('SHA-256') ||
      err.message.includes('التلاعب') ||
      err.message.includes('المصادقة');
    return res.status(400).json({
      success: false,
      error: {
        code: isTampered
          ? 'INVALID_BACKUP_TAMPERED'
          : isCorruptedJson
          ? 'INVALID_BACKUP_FILE'
          : 'INVALID_BACKUP_SCHEMA',
        message: err.message,
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
      isEncrypted,
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
        isEncrypted,
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
        isEncrypted,
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

// POST /api/v1/system/export-data (Admin only with explicit confirmation)
systemRouter.post('/export-data', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { confirm } = req.body || {};
  if (!confirm) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: 'يرجى تأكيد طلب تصدير بيانات المؤسسة صراحة (confirm: true).',
      },
    });
  }

  try {
    const exportData = await generateInstitutionalExport({
      id: req.user!.id,
      name: req.user!.name,
      role: req.user!.role,
    });

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'EXPORT_INSTITUTIONAL_DATA',
      'system',
      'institutional_export',
      {
        entitiesCount: exportData.entities_count,
        exportVersion: exportData.export_version,
      },
      req
    );

    res.json({
      success: true,
      data: exportData,
      message: 'تم تصدير بيانات المؤسسة بنجاح بصيغة قياسية خالية من الأسرار.',
    });
  } catch (err: any) {
    logger.error(`[Export] Institutional export failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: { code: 'EXPORT_FAILED', message: err.message },
    });
  }
});

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
          staging_queue,
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
          centralDirectory: 'LibraryData',
          booksStorage: 'LibraryData/books',
          backupsStorage: 'LibraryData/backups',
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
// =========================================================
// Incoming Watcher & Staging Queue Observability Routes
// (Admin only)
// =========================================================

export const incomingRouter = Router();

// GET /api/v1/system/incoming-status
// Returns watcher status + recent staging queue items
incomingRouter.get('/incoming-status', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const status = getWatcherStatus();

    const { rows: queueItems } = await db.query(
      `SELECT id, original_filename, source, format, file_size_mb, file_hash,
              title, author, category_id, confidence, status, duplicate_reason,
              admin_notes, queued_at, reviewed_at
       FROM staging_queue
       ORDER BY queued_at DESC
       LIMIT 100`
    );

    res.json({
      success: true,
      data: {
        watcher: status,
        queue: queueItems.map((r) => ({
          id: r.id,
          originalFilename: r.original_filename,
          source: r.source,
          format: r.format,
          fileSizeMb: r.file_size_mb,
          fileHash: r.file_hash,
          title: r.title,
          author: r.author,
          categoryId: r.category_id,
          confidence: r.confidence,
          status: r.status,
          duplicateReason: r.duplicate_reason,
          adminNotes: r.admin_notes,
          queuedAt: r.queued_at,
          reviewedAt: r.reviewed_at,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/system/incoming-scan
// Trigger a manual scan of the incoming/ directory
incomingRouter.post('/incoming-scan', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const result = await manualScanIncoming();

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'MANUAL_INCOMING_SCAN',
      'system',
      'incoming',
      { ...result },
      req
    );

    res.json({
      success: true,
      data: result,
      message: `فحص يدوي مكتمل: ${result.found} ملف وُجد، ${result.queued} وُضع في قائمة المراجعة`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/system/staging-queue/:id/reject
// Admin rejects a staged file (marks as REJECTED, does NOT delete file)
incomingRouter.post('/staging-queue/:id/reject', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const { rows } = await db.query(
      `UPDATE staging_queue
       SET status = 'REJECTED', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2
       WHERE id = $3 AND status IN ('PENDING_REVIEW', 'DUPLICATE')
       RETURNING id, original_filename`,
      [notes || null, req.user!.id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'العنصر غير موجود أو تمت مراجعته بالفعل.' } });
    }

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'STAGING_REJECT', 'staging_queue', id, { filename: rows[0].original_filename, notes }, req);

    res.json({ success: true, data: { id: rows[0].id, filename: rows[0].original_filename } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/system/staging-queue/:id/import
// Admin approves and imports a staged file into the digital library
incomingRouter.post('/staging-queue/:id/import', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, author, categoryId, language, summary } = req.body;

  try {
    const { rows: qRows } = await db.query(
      `SELECT * FROM staging_queue WHERE id = $1 AND status = 'PENDING_REVIEW'`,
      [id]
    );

    if (qRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'العنصر غير موجود أو غير قابل للاستيراد في حالته الحالية.' } });
    }

    const item = qRows[0];

    // Verify the staged file still exists
    if (!fs.existsSync(item.staged_file_path)) {
      await db.query(`UPDATE staging_queue SET status = 'ERROR', admin_notes = 'ملف الاستيراد مفقود من مساحة التخزين' WHERE id = $1`, [id]);
      return res.status(404).json({ success: false, error: { code: 'FILE_MISSING', message: 'ملف الاستيراد غير موجود في مساحة التخزين.' } });
    }

    // Move staged file to canonical digital directory
    const ext = path.extname(item.staged_file_path).toLowerCase();
    const bookId = `dig-sq-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const canonicalName = `${bookId}${ext}`;
    const canonicalPath = path.join(serverConfig.dirs.digital, canonicalName);

    fs.renameSync(item.staged_file_path, canonicalPath);

    // Insert book record
    const finalTitle = title || item.title || item.original_filename;
    const finalAuthor = author || item.author || 'مؤلف غير محدد';
    const finalCategoryId = categoryId || item.category_id || null;
    const fileSizeLabel = item.file_size_mb ? `${item.file_size_mb} MB` : null;

    await db.query(
      `INSERT INTO books
        (id, type, title, author, category_id, format, file_size, file_path, file_hash,
         source_origin, uploaded_by, language, summary, pages_count, created_at, updated_at)
       VALUES ($1, 'digital', $2, $3, $4, $5, $6, $7, $8, 'incoming_watcher', $9, $10, $11, $12, NOW(), NOW())`,
      [
        bookId,
        finalTitle,
        finalAuthor,
        finalCategoryId,
        item.format,
        fileSizeLabel,
        canonicalPath,
        item.file_hash,
        req.user!.id,
        language || 'العربية',
        summary || `كتاب مستورد من مجلد الوارد: ${finalTitle}`,
        200,
      ]
    );

    // Mark staging_queue item as IMPORTED
    await db.query(
      `UPDATE staging_queue SET status = 'IMPORTED', reviewed_at = NOW(), reviewed_by = $1 WHERE id = $2`,
      [req.user!.id, id]
    );

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'STAGING_IMPORT', 'books', bookId, { stagingQueueId: id, title: finalTitle }, req);

    res.json({
      success: true,
      data: { bookId, title: finalTitle, message: 'تم استيراد الكتاب بنجاح إلى المستودع الرقمي المركزي.' },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});
