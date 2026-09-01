/**
 * Mishkat Central Server Notification Repository
 * Provides server-authoritative notification data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { AppNotification } from '../types/library';

export class NotificationRepository {
  /**
   * Fetch notifications for current authenticated user (GET /api/v1/notifications)
   */
  public async getNotifications(): Promise<{
    success: boolean;
    data?: AppNotification[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<AppNotification[]>('/notifications');
    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'NOTIFICATIONS_FETCH_FAILED',
        message: 'تعذر استرجاع الإشعارات من الخادم المركزي.',
      },
    };
  }

  /**
   * Mark a single notification as read (POST /api/v1/notifications/:id/read)
   */
  public async markAsRead(id: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post(`/notifications/${id}/read`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'MARK_READ_FAILED',
        message: 'تعذر تحديث حالة الإشعار في الخادم المركزي.',
      },
    };
  }

  /**
   * Mark all notifications for current user as read (POST /api/v1/notifications/mark-all-read)
   */
  public async markAllAsRead(): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post('/notifications/mark-all-read');
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'MARK_ALL_READ_FAILED',
        message: 'تعذر تحديث حالة جميع الإشعارات في الخادم المركزي.',
      },
    };
  }

  /**
   * Clear all notifications for current user (DELETE /api/v1/notifications/clear)
   */
  public async clearNotifications(): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.delete('/notifications/clear');
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'CLEAR_NOTIFICATIONS_FAILED',
        message: 'تعذر حذف الإشعارات من الخادم المركزي.',
      },
    };
  }
}

export const notificationRepository = new NotificationRepository();
