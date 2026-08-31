/**
 * Mishkat Central Server Category Repository
 * Provides server-authoritative category data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { Category } from '../types/library';

export interface CreateCategoryPayload {
  name: string;
  nameEn?: string;
  description?: string;
  color?: string;
  iconName?: string;
}

export interface UpdateCategoryPayload {
  name?: string;
  nameEn?: string;
  description?: string;
  color?: string;
  iconName?: string;
}

export class CategoryRepository {
  /**
   * Fetch all categories from the Central Server (GET /api/v1/categories)
   */
  public async getCategories(): Promise<{
    success: boolean;
    data?: Category[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<Category[]>('/categories');
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'CATEGORIES_FETCH_FAILED',
        message: 'تعذر استرجاع قائمة التصنيفات من الخادم المركزي.',
      },
    };
  }

  /**
   * Create a new category on the Central Server (POST /api/v1/categories - Admin only)
   */
  public async createCategory(
    payload: CreateCategoryPayload
  ): Promise<{
    success: boolean;
    data?: Category;
    error?: ApiError;
  }> {
    const res = await apiClient.post<Category>('/categories', payload);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'CATEGORY_CREATE_FAILED',
        message: 'فشل إضافة التصنيف في الخادم المركزي.',
      },
    };
  }

  /**
   * Update category on the Central Server (PUT /api/v1/categories/:id - Admin only)
   */
  public async updateCategory(
    id: string,
    payload: UpdateCategoryPayload
  ): Promise<{
    success: boolean;
    data?: { message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.put<{ message: string }>(`/categories/${id}`, payload);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'CATEGORY_UPDATE_FAILED',
        message: 'فشل تحديث بيانات التصنيف في الخادم المركزي.',
      },
    };
  }

  /**
   * Delete category with atomic book reassignment on Central Server (POST /api/v1/categories/:id/reassign-delete - Admin only)
   */
  public async reassignAndDeleteCategory(
    categoryId: string,
    targetCategoryId: string
  ): Promise<{
    success: boolean;
    data?: { message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.post<{ message: string }>(
      `/categories/${categoryId}/reassign-delete`,
      { targetCategoryId }
    );
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'CATEGORY_DELETE_FAILED',
        message: 'فشل حذف التصنيف وإعادة توجيه الكتب في الخادم المركزي.',
      },
    };
  }

  /**
   * Simple delete category (DELETE /api/v1/categories/:id - Admin only)
   */
  public async deleteCategory(
    id: string,
    targetCategoryId?: string
  ): Promise<{
    success: boolean;
    data?: { message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.delete<{ message: string }>(
      `/categories/${id}`,
      targetCategoryId ? { targetCategoryId } : undefined
    );
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'CATEGORY_DELETE_FAILED',
        message: 'فشل حذف التصنيف في الخادم المركزي.',
      },
    };
  }
}

export const categoryRepository = new CategoryRepository();
