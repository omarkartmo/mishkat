import fs from 'fs';
import path from 'path';
import { serverConfig } from '../config';
import { logger } from '../utils/logger';
import {
  createDatabaseBackup,
  LOCAL_BACKUP_RETENTION_LIMIT,
  BackupData,
} from './backupService';
import {
  googleDriveService,
  CLOUD_BACKUP_RETENTION_LIMIT,
} from './googleDriveService';

export interface BackupOverallStatus {
  local: {
    status: 'successful' | 'failed' | 'idle';
    lastBackupTime: string | null;
    lastBackupFile: string | null;
    error: string | null;
    count: number;
    maxRetention: number;
  };
  cloud: {
    status: 'successful' | 'waiting' | 'failed' | 'not_connected';
    connected: boolean;
    lastUploadTime: string | null;
    error: string | null;
    count: number | null;
    maxRetention: number;
    pendingFile: string | null;
  };
}

class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private isRunningBackup = false;

  private lastLocalBackupTime: string | null = null;
  private lastLocalBackupFile: string | null = null;
  private lastLocalBackupStatus: 'successful' | 'failed' | 'idle' = 'idle';
  private lastLocalBackupError: string | null = null;

  private lastCloudUploadTime: string | null = null;
  private lastCloudUploadStatus: 'successful' | 'waiting' | 'failed' | 'not_connected' = 'not_connected';
  private lastCloudUploadError: string | null = null;
  private pendingCloudUploadFile: string | null = null;

  constructor() {
    this.detectInitialState();
  }

  /**
   * Initializes initial timestamps and status from existing local backup files.
   */
  private detectInitialState(): void {
    try {
      const dir = serverConfig.dirs.backups;
      if (fs.existsSync(dir)) {
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.startsWith('mishkat_backup_') && f.endsWith('.json'))
          .map((f) => ({
            name: f,
            time: fs.statSync(path.join(dir, f)).mtimeMs,
          }))
          .sort((a, b) => b.time - a.time);

        if (files.length > 0) {
          this.lastLocalBackupFile = files[0].name;
          this.lastLocalBackupTime = new Date(files[0].time).toISOString();
          this.lastLocalBackupStatus = 'successful';
        }
      }
    } catch (err: any) {
      logger.warn(`[BackupScheduler] Could not detect initial backup state: ${err.message}`);
    }
  }

  /**
   * Starts the background scheduler loop.
   */
  public start(): void {
    if (this.timer) return;

    logger.info('[BackupScheduler] Automatic daily backup scheduler activated.');

    // Check periodically (every 15 minutes) if today's backup has run or if retry is needed
    this.timer = setInterval(() => {
      this.checkAndRunDailyBackup().catch((err) => {
        logger.error(`[BackupScheduler] Scheduled run error: ${err.message}`);
      });
    }, 15 * 60 * 1000);

    // Initial check shortly after startup (after 10 seconds)
    setTimeout(() => {
      this.checkAndRunDailyBackup().catch(() => {});
    }, 10_000);
  }

  /**
   * Stops the background scheduler loop.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Evaluates whether a daily backup is needed for today.
   */
  public async checkAndRunDailyBackup(): Promise<void> {
    if (this.isRunningBackup) return;

    const todayDateStr = new Date().toISOString().slice(0, 10);
    const lastBackupDateStr = this.lastLocalBackupTime ? this.lastLocalBackupTime.slice(0, 10) : null;

    // If no backup exists for today, trigger automatic daily backup
    if (lastBackupDateStr !== todayDateStr) {
      logger.info(`[BackupScheduler] Daily backup needed for date: ${todayDateStr}`);
      await this.runBackupCycle('النظام (النسخ التلقائي اليومي)');
      return;
    }

    // If there is a pending cloud upload, retry it
    if (this.pendingCloudUploadFile) {
      await this.retryPendingUpload();
    }
  }

  /**
   * Executes the strict backup cycle:
   * 1. Local backup creation with atomic write & validation.
   * 2. If local succeeds: attempt Google Drive upload if connected.
   * 3. If cloud upload fails: mark pending and schedule retry; local backup remains SUCCESSFUL.
   */
  public async runBackupCycle(exportedBy: string): Promise<{
    localSuccess: boolean;
    fileName?: string;
    cloudSuccess?: boolean;
    cloudStatus: string;
    data?: BackupData;
    error?: string;
  }> {
    if (this.isRunningBackup) {
      throw new Error('عملية نسخ احتياطي أخرى جارية بالفعل حالياً.');
    }

    this.isRunningBackup = true;

    try {
      // Step 1: Create local backup first
      let localResult;
      try {
        localResult = await createDatabaseBackup(exportedBy, 'manual');
        this.lastLocalBackupTime = new Date().toISOString();
        this.lastLocalBackupFile = localResult.fileName;
        this.lastLocalBackupStatus = 'successful';
        this.lastLocalBackupError = null;
        logger.info(`[BackupScheduler] Local backup succeeded: ${localResult.fileName}`);
      } catch (localErr: any) {
        this.lastLocalBackupStatus = 'failed';
        this.lastLocalBackupError = localErr.message;
        logger.error(`[BackupScheduler] Local backup failed: ${localErr.message}`);
        return {
          localSuccess: false,
          cloudSuccess: false,
          cloudStatus: 'not_attempted',
          error: localErr.message,
        };
      }

      // Step 2: Check Google Drive connection and upload
      const driveStatus = await googleDriveService.getConnectionStatus();
      if (!driveStatus.connected) {
        this.lastCloudUploadStatus = 'not_connected';
        this.lastCloudUploadError = null;
        this.pendingCloudUploadFile = null;
        return {
          localSuccess: true,
          fileName: localResult.fileName,
          cloudSuccess: false,
          cloudStatus: 'not_connected',
          data: localResult.data,
        };
      }

      // Step 3: Attempt Google Drive upload
      try {
        await googleDriveService.uploadBackup(localResult.filePath, localResult.fileName);
        this.lastCloudUploadTime = new Date().toISOString();
        this.lastCloudUploadStatus = 'successful';
        this.lastCloudUploadError = null;
        this.pendingCloudUploadFile = null;
        logger.info(`[BackupScheduler] Cloud upload to Google Drive succeeded for: ${localResult.fileName}`);
        return {
          localSuccess: true,
          fileName: localResult.fileName,
          cloudSuccess: true,
          cloudStatus: 'successful',
          data: localResult.data,
        };
      } catch (cloudErr: any) {
        // Cloud failure must NOT fail local backup
        this.lastCloudUploadStatus = 'waiting';
        this.lastCloudUploadError = cloudErr.message;
        this.pendingCloudUploadFile = localResult.fileName;
        logger.warn(`[BackupScheduler] Cloud upload failed; marked pending for automatic retry: ${cloudErr.message}`);

        // Schedule automatic retry in 5 minutes
        this.scheduleRetry(5 * 60 * 1000);

        return {
          localSuccess: true,
          fileName: localResult.fileName,
          cloudSuccess: false,
          cloudStatus: 'waiting',
          data: localResult.data,
          error: `تم حفظ النسخة محلياً بنجاح، وتأجل الرفع السحابي: ${cloudErr.message}`,
        };
      }
    } finally {
      this.isRunningBackup = false;
    }
  }

  /**
   * Retries uploading pending backup to Google Drive.
   */
  public async retryPendingUpload(): Promise<boolean> {
    if (!this.pendingCloudUploadFile || this.isRunningBackup) {
      return false;
    }

    const driveStatus = await googleDriveService.getConnectionStatus();
    if (!driveStatus.connected) {
      return false;
    }

    const filePath = path.join(serverConfig.dirs.backups, this.pendingCloudUploadFile);
    if (!fs.existsSync(filePath)) {
      this.pendingCloudUploadFile = null;
      return false;
    }

    try {
      logger.info(`[BackupScheduler] Retrying upload of pending backup: ${this.pendingCloudUploadFile}`);
      await googleDriveService.uploadBackup(filePath, this.pendingCloudUploadFile);
      this.lastCloudUploadTime = new Date().toISOString();
      this.lastCloudUploadStatus = 'successful';
      this.lastCloudUploadError = null;
      this.pendingCloudUploadFile = null;
      logger.info('[BackupScheduler] Pending cloud upload succeeded.');
      return true;
    } catch (err: any) {
      this.lastCloudUploadStatus = 'waiting';
      this.lastCloudUploadError = err.message;
      logger.warn(`[BackupScheduler] Retry failed: ${err.message}. Will retry later.`);
      this.scheduleRetry(10 * 60 * 1000);
      return false;
    }
  }

  private scheduleRetry(delayMs: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryPendingUpload().catch(() => {});
    }, delayMs);
  }

  /**
   * Computes the complete authoritative system status for the Admin UI.
   */
  public async getOverallStatus(): Promise<BackupOverallStatus> {
    const dir = serverConfig.dirs.backups;
    let localCount = 0;
    if (fs.existsSync(dir)) {
      localCount = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith('mishkat_backup_') && f.endsWith('.json')).length;
    }

    const driveStatus = await googleDriveService.getConnectionStatus();
    let cloudCount: number | null = null;

    if (driveStatus.connected) {
      try {
        const cloudFiles = await googleDriveService.listCloudBackups();
        cloudCount = cloudFiles.length;
      } catch {
        cloudCount = null;
      }
    }

    return {
      local: {
        status: this.lastLocalBackupStatus,
        lastBackupTime: this.lastLocalBackupTime,
        lastBackupFile: this.lastLocalBackupFile,
        error: this.lastLocalBackupError,
        count: localCount,
        maxRetention: LOCAL_BACKUP_RETENTION_LIMIT,
      },
      cloud: {
        status: !driveStatus.connected
          ? 'not_connected'
          : this.pendingCloudUploadFile
          ? 'waiting'
          : this.lastCloudUploadStatus,
        connected: driveStatus.connected,
        lastUploadTime: this.lastCloudUploadTime,
        error: this.lastCloudUploadError || driveStatus.error || null,
        count: cloudCount,
        maxRetention: CLOUD_BACKUP_RETENTION_LIMIT,
        pendingFile: this.pendingCloudUploadFile,
      },
    };
  }
}

export const backupScheduler = new BackupScheduler();
