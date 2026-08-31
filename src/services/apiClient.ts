/**
 * Mishkat Central Server REST API Client
 */

const API_BASE_URL = '/api/v1';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('mishkat_jwt_token') || sessionStorage.getItem('mishkat_jwt_token');
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

  public getToken(): string | null {
    return this.token;
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const json = await response.json();
      return json as ApiResponse<T>;
    } catch (err: any) {
      console.warn(`[ApiClient] Network request failed for ${endpoint}:`, err.message);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'تعذر الاتصال بالخادم المركزي. جاري استخدام البيانات المحلية المخزنة.',
        },
      };
    }
  }

  public async get<T = any>(endpoint: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
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

  public async post<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async put<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  public async uploadFile(file: File, fieldName: 'file' | 'cover' = 'file'): Promise<ApiResponse<any>> {
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
        error: { code: 'UPLOAD_FAILED', message: err.message },
      };
    }
  }
}

export const apiClient = new ApiClient();
