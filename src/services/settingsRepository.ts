/**
 * Mishkat Central Server Settings & System Repository
 * Provides server-authoritative settings, system backup, and reset capabilities via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { SystemConfig } from '../types/library';

export class SettingsRepository {
  /**
   * Fetch system settings (GET /api/v1/settings)
   */
  public async getSettings(): Promise<{
    success: boolean;
    data?: SystemConfig;
    error?: ApiError;
  }> {
    const res = await apiClient.get<SystemConfig>('/settings');
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SETTINGS_FETCH_FAILED',
        message: 'تعذر استرجاع إعدادات النظام من الخادم المركزي.',
      },
    };
  }

  /**
   * Update system settings (PUT /api/v1/settings)
   */
  public async updateSettings(config: SystemConfig): Promise<{
    success: boolean;
    data?: { message: string; config: SystemConfig };
    error?: ApiError;
  }> {
    const res = await apiClient.put<{ message: string; config: SystemConfig }>('/settings', config);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SETTINGS_UPDATE_FAILED',
        message: 'تعذر حفظ إعدادات النظام في الخادم المركزي.',
      },
    };
  }

  /**
   * Test Google Gemini AI connection (POST /api/v1/settings/test-gemini)
   */
  public async testGemini(apiKey?: string): Promise<{
    success: boolean;
    message: string;
    model?: string;
    error?: string;
  }> {
    const res = await apiClient.post<{ success: boolean; message: string; model?: string; error?: string }>(
      '/settings/test-gemini',
      { apiKey }
    );
    if (res.success && res.data) {
      return res.data;
    }
    return {
      success: false,
      message: res.error?.message || 'فشل الاتصال بمحرك الذكاء الاصطناعي.',
    };
  }

  /**
   * Create and export server database backup (POST /api/v1/backups/create)
   */
  public async createBackup(): Promise<{
    success: boolean;
    data?: {
      message: string;
      fileName: string;
      createdAt: string;
      tablesCount: number;
      backup?: Record<string, any>;
    };
    error?: ApiError;
  }> {
    const res = await apiClient.post<any>('/backups/create', {});
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'BACKUP_CREATE_FAILED',
        message: 'تعذر إنشاء وتصدير النسخة الاحتياطية من الخادم المركزي.',
      },
    };
  }

  /**
   * Reset system database to defaults (POST /api/v1/system/reset-demo)
   */
  public async resetDatabase(): Promise<{
    success: boolean;
    data?: { message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.post<{ message: string }>('/system/reset-demo', { confirm: true });
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SYSTEM_RESET_FAILED',
        message: 'تعذر إعادة تعيين قاعدة البيانات في الخادم المركزي.',
      },
    };
  }

  /**
   * List available database backups (GET /api/v1/backups)
   */
  public async listBackups(): Promise<{
    success: boolean;
    data?: Array<{
      fileName: string;
      type: 'manual' | 'pre_restore';
      sizeBytes: number;
      sizeFormatted: string;
      createdAt: string;
    }>;
    error?: ApiError;
  }> {
    const res = await apiClient.get<any[]>('/backups');
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LIST_BACKUPS_FAILED',
        message: 'تعذر جلب قائمة النسخ الاحتياطية من الخادم المركزي.',
      },
    };
  }

  /**
   * Restore database from a local backup file (POST /api/v1/backups/:fileName/restore)
   */
  public async restoreBackup(fileName: string): Promise<{
    success: boolean;
    data?: {
      message: string;
      backupFileName: string;
      preRestoreBackup: string;
      restoredCounts: Record<string, number>;
    };
    error?: ApiError;
  }> {
    const res = await apiClient.post<any>(`/backups/${encodeURIComponent(fileName)}/restore`, { confirm: true });
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'RESTORE_BACKUP_FAILED',
        message: 'تعذر استرجاع النسخة الاحتياطية على الخادم المركزي.',
      },
    };
  }

  /**
   * Get overall backup status (local and cloud) (GET /api/v1/backups/status)
   */
  public async getBackupStatus(): Promise<{
    success: boolean;
    data?: {
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
    };
    error?: ApiError;
  }> {
    const res = await apiClient.get<any>('/backups/status');
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'GET_STATUS_FAILED',
        message: 'تعذر جلب حالة النسخ الاحتياطي من الخادم المركزي.',
      },
    };
  }

  /**
   * Get Google Drive authorization URL (GET /api/v1/backups/drive/auth-url)
   */
  public async getGoogleDriveAuthUrl(): Promise<{
    success: boolean;
    data?: { url: string };
    error?: ApiError;
  }> {
    const res = await apiClient.get<{ url: string }>('/backups/drive/auth-url');
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'AUTH_URL_FAILED',
        message: 'تعذر الحصول على رابط المصادقة من Google Drive.',
      },
    };
  }

  /**
   * Save Google Drive OAuth configuration (POST /api/v1/backups/drive/config)
   */
  public async saveGoogleDriveConfig(config: { clientId: string; clientSecret: string; redirectUri?: string }): Promise<{
    success: boolean;
    data?: { message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.post<any>('/backups/drive/config', config);
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'CONFIG_FAILED',
        message: 'تعذر حفظ إعدادات Google Drive.',
      },
    };
  }

  /**
   * Get Google Drive configuration (GET /api/v1/backups/drive/config)
   */
  public async getGoogleDriveConfig(): Promise<{
    success: boolean;
    data?: { configured: boolean; clientId: string; hasSecret: boolean };
    error?: ApiError;
  }> {
    const res = await apiClient.get<any>('/backups/drive/config');
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'GET_CONFIG_FAILED',
        message: 'تعذر جلب إعدادات Google Drive.',
      },
    };
  }

  /**
   * Connect Google Drive with authorization code (POST /api/v1/backups/drive/connect)
   */
  public async connectGoogleDrive(code: string): Promise<{
    success: boolean;
    data?: { message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.post<any>('/backups/drive/connect', { code });
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'CONNECT_FAILED',
        message: 'تعذر إتمام ربط حساب Google Drive.',
      },
    };
  }

  /**
   * Disconnect Google Drive (POST /api/v1/backups/drive/disconnect)
   */
  public async disconnectGoogleDrive(): Promise<{
    success: boolean;
    data?: { message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.post<any>('/backups/drive/disconnect', {});
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'DISCONNECT_FAILED',
        message: 'تعذر إلغاء ربط حساب Google Drive.',
      },
    };
  }

  /**
   * List cloud backups on Google Drive (GET /api/v1/backups/drive/backups)
   */
  public async listDriveBackups(): Promise<{
    success: boolean;
    data?: Array<{
      id: string;
      name: string;
      sizeBytes: number;
      sizeFormatted: string;
      createdAt: string;
    }>;
    error?: ApiError;
  }> {
    const res = await apiClient.get<any[]>('/backups/drive/backups');
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LIST_DRIVE_BACKUPS_FAILED',
        message: 'تعذر جلب قائمة النسخ السحابية من Google Drive.',
      },
    };
  }

  /**
   * Restore database from Google Drive cloud backup (POST /api/v1/backups/drive/:fileId/restore)
   */
  public async restoreDriveBackup(fileId: string): Promise<{
    success: boolean;
    data?: {
      message: string;
      fileId: string;
      preRestoreBackup: string;
      restoredCounts: Record<string, number>;
    };
    error?: ApiError;
  }> {
    const res = await apiClient.post<any>(`/backups/drive/${encodeURIComponent(fileId)}/restore`, { confirm: true });
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'RESTORE_DRIVE_BACKUP_FAILED',
        message: 'تعذر استرجاع النسخة السحابية من Google Drive.',
      },
    };
  }

  /**
   * Retry pending cloud upload to Google Drive (POST /api/v1/backups/drive/retry)
   */
  public async retryDriveUpload(): Promise<{
    success: boolean;
    data?: { retried: boolean; uploaded: boolean; message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.post<any>('/backups/drive/retry', {});
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'RETRY_FAILED',
        message: 'تعذر إعادة محاولة الرفع السحابي.',
      },
    };
  }

  /**
   * Export unencrypted institutional data for system migration / auditing (POST /api/v1/system/export-data)
   */
  public async exportInstitutionalData(): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post<any>('/system/export-data', { confirm: true });
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || {
        code: 'EXPORT_DATA_FAILED',
        message: 'تعذر تصدير بيانات المؤسسة من الخادم المركزي.',
      },
    };
  }
}

export const settingsRepository = new SettingsRepository();
