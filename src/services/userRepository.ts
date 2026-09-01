/**
 * Mishkat Central Server User Repository
 * Provides server-authoritative users and students data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { User, StudentRosterRow } from '../types/library';

export class UserRepository {
  /**
   * Fetch users/students from Central Server (GET /api/v1/users)
   */
  public async getUsers(params?: { role?: string; search?: string }): Promise<{
    success: boolean;
    data?: User[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<User[]>('/users', params);
    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'USERS_FETCH_FAILED',
        message: 'تعذر استرجاع قائمة المستخدمين والطلبة من الخادم المركزي.',
      },
    };
  }

  /**
   * Create a new user/student (POST /api/v1/users)
   */
  public async createUser(user: Omit<User, 'id'> & { password?: string }): Promise<{
    success: boolean;
    data?: User;
    error?: ApiError;
  }> {
    const res = await apiClient.post<User>('/users', user);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'USER_CREATE_FAILED',
        message: 'تعذر إضافة المستخدم في الخادم المركزي.',
      },
    };
  }

  /**
   * Update an existing user/student (PUT /api/v1/users/:id)
   */
  public async updateUser(
    id: string,
    updates: Partial<User> & { password?: string }
  ): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.put(`/users/${id}`, updates);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'USER_UPDATE_FAILED',
        message: 'تعذر تحديث بيانات المستخدم في الخادم المركزي.',
      },
    };
  }

  /**
   * Delete a user/student (DELETE /api/v1/users/:id)
   */
  public async deleteUser(id: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.delete(`/users/${id}`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'USER_DELETE_FAILED',
        message: 'تعذر حذف المستخدم من الخادم المركزي.',
      },
    };
  }

  /**
   * Bulk import student roster (POST /api/v1/users/roster-import)
   */
  public async bulkImportStudents(roster: StudentRosterRow[]): Promise<{
    success: boolean;
    data?: {
      importedCount: number;
      generatedCredentials: { name: string; regNumber: string; tempPass: string }[];
    };
    error?: ApiError;
  }> {
    const res = await apiClient.post<{ message: string }>('/users/roster-import', {
      students: roster,
    });

    if (res.success) {
      const generated = roster.map((r) => ({
        name: r.name,
        regNumber: r.registrationNumber,
        tempPass: '123456',
      }));

      return {
        success: true,
        data: {
          importedCount: roster.length,
          generatedCredentials: generated,
        },
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'ROSTER_IMPORT_FAILED',
        message: 'تعذر استيراد قائمة الطلبة إلى الخادم المركزي.',
      },
    };
  }

  /**
   * Reset user password (POST /api/v1/users/:id/reset-password)
   */
  public async resetPassword(
    id: string,
    newPassword?: string
  ): Promise<{
    success: boolean;
    data?: { message: string; newPassword: string };
    error?: ApiError;
  }> {
    const res = await apiClient.post<{ message: string; newPassword: string }>(
      `/users/${id}/reset-password`,
      { newPassword: newPassword || '123456' }
    );

    if (res.success) {
      return {
        success: true,
        data: res.data || { message: 'تم إعادة تعيين كلمة المرور بنجاح.', newPassword: newPassword || '123456' },
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'RESET_PASSWORD_FAILED',
        message: 'تعذر إعادة تعيين كلمة المرور في الخادم المركزي.',
      },
    };
  }
}

export const userRepository = new UserRepository();
