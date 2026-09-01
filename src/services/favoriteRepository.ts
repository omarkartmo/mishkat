/**
 * Mishkat Central Server Favorite Repository
 * Provides server-authoritative favorites data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';

export class FavoriteRepository {
  /**
   * Fetch favorite book IDs for authenticated user (GET /api/v1/favorites)
   */
  public async getFavorites(): Promise<{
    success: boolean;
    data?: string[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<string[]>('/favorites');
    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'FAVORITES_FETCH_FAILED',
        message: 'تعذر استرجاع المفضلة من الخادم المركزي.',
      },
    };
  }

  /**
   * Toggle favorite status for a book (POST /api/v1/favorites/toggle)
   */
  public async toggleFavorite(bookId: string): Promise<{
    success: boolean;
    data?: { isFavorited: boolean; bookId: string };
    error?: ApiError;
  }> {
    const res = await apiClient.post<{ isFavorited: boolean; bookId: string }>('/favorites/toggle', { bookId });
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'FAVORITE_TOGGLE_FAILED',
        message: 'تعذر تحديث المفضلة في الخادم المركزي.',
      },
    };
  }

  /**
   * Remove a book from favorites (DELETE /api/v1/favorites/:bookId)
   */
  public async removeFavorite(bookId: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.delete(`/favorites/${bookId}`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'FAVORITE_REMOVE_FAILED',
        message: 'تعذر إزالة الكتاب من المفضلة في الخادم المركزي.',
      },
    };
  }
}

export const favoriteRepository = new FavoriteRepository();
