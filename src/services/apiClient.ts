/**
 * Mishkat Central Server REST API Client
 * Centralized HTTP Client handling Authorization, Error Formatting, and 401 Interception.
 */

const API_BASE_URL = '/api/v1';

export interface ApiError {
  code: string;
  message: string;
  status?: number;
  remainingSeconds?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

type UnauthorizedHandler = () => void;

class ApiClient {
  private token: string | null = null;
  private onUnauthorizedListeners: Set<UnauthorizedHandler> = new Set();

  constructor() {
    this.token =
      localStorage.getItem('mishkat_jwt_token') ||
      sessionStorage.getItem('mishkat_jwt_token');
  }

  public setToken(token: string | null, persist = true) {
    this.token = token;
    if (token) {
      if (persist) {
        localStorage.setItem('mishkat_jwt_token', token);
      } else {
        sessionStorage.setItem('mishkat_jwt_token', token);
      }
    } else {
      localStorage.removeItem('mishkat_jwt_token');
      sessionStorage.removeItem('mishkat_jwt_token');
    }
  }

  public getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  public getToken(): string | null {
    return this.token;
  }

  /**
   * Register a listener for 401 Unauthorized responses
   */
  public onUnauthorized(handler: UnauthorizedHandler): () => void {
    this.onUnauthorizedListeners.add(handler);
    return () => {
      this.onUnauthorizedListeners.delete(handler);
    };
  }

  private notifyUnauthorized() {
    this.onUnauthorizedListeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[ApiClient] Error in unauthorized listener:', err);
      }
    });
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      // Handle 401 Unauthorized
      if (response.status === 401 && endpoint !== '/auth/login') {
        this.notifyUnauthorized();
      }

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        const errorData: ApiError = {
          code: json?.error?.code || `HTTP_${response.status}`,
          message:
            json?.error?.message ||
            (response.status === 401
              ? 'انتهت صلاحية الجلسة أو تعذر التحقق من الهوية.'
              : response.status === 403
              ? 'ليس لديك صلاحية لتنفيذ هذه العملية على الخادم المركزي.'
              : response.status === 404
              ? 'المورد المطلوب غير موجود على الخادم المركزي.'
              : 'حدث خطأ أثناء معالجة الطلب في الخادم المركزي.'),
          status: response.status,
          remainingSeconds: json?.error?.remainingSeconds,
        };

        return {
          success: false,
          error: errorData,
        };
      }

      return json as ApiResponse<T>;
    } catch (err: any) {
      console.warn(`[ApiClient] Network request failed for ${endpoint}:`, err.message);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message:
            'تعذر الاتصال بالخادم المركزي. يرجى التحقق من اتصال الشبكة والمحاولة مرة أخرى.',
          status: 0,
        },
      };
    }
  }

  public async get<T = any>(
    endpoint: string,
    params?: Record<string, any>
  ): Promise<ApiResponse<T>> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          searchParams.append(k, String(v));
        }
      });
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }
    return this.request<T>(url, { method: 'GET' });
  }

  public async post<T = any>(
    endpoint: string,
    body?: any
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async put<T = any>(
    endpoint: string,
    body?: any
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async patch<T = any>(
    endpoint: string,
    body?: any
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async uploadFile(
    file: File,
    fieldName: 'file' | 'cover' = 'file'
  ): Promise<ApiResponse<any>> {
    const formData = new FormData();
    formData.append(fieldName, file);

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/books/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });
      return await response.json();
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: 'فشل رفع الملف إلى الخادم المركزي.',
          status: 0,
        },
      };
    }
  }

  public async getBlob(endpoint: string): Promise<ApiResponse<Blob>> {
    const headers = this.getAuthHeaders();

    try {
      const url = endpoint.startsWith('/api/') ? endpoint : `${API_BASE_URL}${endpoint}`;
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (response.status === 401) {
        this.notifyUnauthorized();
      }

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        const errorData: ApiError = {
          code: json?.error?.code || `HTTP_${response.status}`,
          message:
            json?.error?.message ||
            (response.status === 401
              ? 'انتهت صلاحية الجلسة أو تعذر التحقق من الهوية.'
              : response.status === 403
              ? 'ليس لديك صلاحية للوصول إلى هذا الملف الرقمي على الخادم المركزي.'
              : response.status === 404
              ? 'ملف الكتاب الرقمي غير موجود على الخادم المركزي.'
              : 'تعذر تحميل الملف الرقمي من الخادم المركزي.'),
          status: response.status,
        };

        return {
          success: false,
          error: errorData,
        };
      }

      const blob = await response.blob();
      return {
        success: true,
        data: blob,
      };
    } catch (err: any) {
      console.warn(`[ApiClient] getBlob request failed for ${endpoint}:`, err.message);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message:
            'تعذر الاتصال بالخادم المركزي. يرجى التحقق من اتصال الشبكة والمحاولة مرة أخرى.',
          status: 0,
        },
      };
    }
  }
}

export const apiClient = new ApiClient();
