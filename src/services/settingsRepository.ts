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
}

export const settingsRepository = new SettingsRepository();
