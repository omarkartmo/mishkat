/**
 * Mishkat Central Server Authentication Repository
 * Provides server-authoritative authentication and session operations via REST API.
 */

import { apiClient, ApiError, ApiResponse } from './apiClient';
import { User } from '../types/library';

export interface LoginCredentials {
  registrationNumber: string;
  password?: string;
}

export interface AuthSessionData {
  token: string;
  user: User;
}

export class AuthRepository {
  /**
   * Authenticate against Central Server using registration number/username and password.
   */
  public async login(
    credentials: LoginCredentials
  ): Promise<{ success: boolean; data?: AuthSessionData; error?: ApiError }> {
    const res = await apiClient.post<AuthSessionData>('/auth/login', {
      registrationNumber: credentials.registrationNumber.trim(),
      password: credentials.password,
    });

    if (res.success && res.data?.token) {
      apiClient.setToken(res.data.token, true);
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'AUTH_FAILED',
        message: 'فشل تسجيل الدخول. يرجى التحقق من صحة البيانات.',
      },
    };
  }

  /**
   * Fetch current authenticated user profile from Central Server (GET /api/v1/auth/me)
   */
  public async getCurrentUser(): Promise<{
    success: boolean;
    user?: User;
    error?: ApiError;
  }> {
    const res = await apiClient.get<{ user: User }>('/auth/me');

    if (res.success && res.data?.user) {
      return {
        success: true,
        user: res.data.user,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'USER_FETCH_FAILED',
        message: 'تعذر استرجاع بيانات المستخدم من الخادم المركزي.',
      },
    };
  }

  /**
   * Terminate active server session and clear authentication token.
   */
  public async logout(): Promise<{ success: boolean; error?: ApiError }> {
    try {
      if (apiClient.getToken()) {
        await apiClient.post('/auth/logout');
      }
    } catch (err) {
      console.warn('[AuthRepository] Logout server notification failed:', err);
    } finally {
      apiClient.setToken(null);
    }

    return { success: true };
  }
}

export const authRepository = new AuthRepository();
