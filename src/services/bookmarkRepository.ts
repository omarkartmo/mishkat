/**
 * Mishkat Central Server Bookmark Repository
 * Provides server-authoritative physical bookmarks data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { PhysicalBookmark } from '../types/library';

export class BookmarkRepository {
  /**
   * Fetch physical bookmarks from Central Server (GET /api/v1/bookmarks)
   */
  public async getBookmarks(studentId?: string): Promise<{
    success: boolean;
    data?: PhysicalBookmark[];
    error?: ApiError;
  }> {
    const endpoint = studentId ? `/bookmarks?studentId=${encodeURIComponent(studentId)}` : '/bookmarks';
    const res = await apiClient.get<PhysicalBookmark[]>(endpoint);
    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'BOOKMARKS_FETCH_FAILED',
        message: 'تعذر استرجاع فواصل القراءة من الخادم المركزي.',
      },
    };
  }

  /**
   * Create or update a physical bookmark (POST /api/v1/bookmarks)
   */
  public async saveBookmark(bookmark: Partial<PhysicalBookmark> & { bookId: string; bookTitle: string }): Promise<{
    success: boolean;
    data?: PhysicalBookmark;
    error?: ApiError;
  }> {
    const res = await apiClient.post<PhysicalBookmark>('/bookmarks', bookmark);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'BOOKMARK_SAVE_FAILED',
        message: 'تعذر حفظ فاصل القراءة في الخادم المركزي.',
      },
    };
  }

  /**
   * Delete a physical bookmark (DELETE /api/v1/bookmarks/:id)
   */
  public async deleteBookmark(id: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.delete(`/bookmarks/${id}`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'BOOKMARK_DELETE_FAILED',
        message: 'تعذر حذف فاصل القراءة من الخادم المركزي.',
      },
    };
  }
}

export const bookmarkRepository = new BookmarkRepository();
