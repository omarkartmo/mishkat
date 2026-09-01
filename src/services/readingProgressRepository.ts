/**
 * Mishkat Central Server Reading Progress Repository
 * Provides server-authoritative reading progress data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { ReadingProgress } from '../types/library';

export interface ApiReadingProgressItem {
  id: string;
  studentId: string;
  bookId: string;
  currentPage: number;
  totalPages: number;
  percentage: number;
  lastReadAt?: string;
  isCompleted: boolean;
  isDismissed: boolean;
}

export class ReadingProgressRepository {
  /**
   * Fetch reading progress from Central Server and return as map of bookId -> ReadingProgress (GET /api/v1/reading-progress)
   */
  public async getReadingProgressMap(studentId?: string): Promise<{
    success: boolean;
    data?: Record<string, ReadingProgress>;
    error?: ApiError;
  }> {
    const endpoint = studentId ? `/reading-progress?studentId=${encodeURIComponent(studentId)}` : '/reading-progress';
    const res = await apiClient.get<ApiReadingProgressItem[]>(endpoint);
    if (res.success && Array.isArray(res.data)) {
      const map: Record<string, ReadingProgress> = {};
      res.data
        .filter((p) => !p.isDismissed)
        .forEach((p) => {
          map[p.bookId] = {
            currentPage: p.currentPage,
            totalPages: p.totalPages,
            percentage: p.percentage,
            lastReadAt: p.lastReadAt,
            isCompleted: p.isCompleted,
          };
        });
      return {
        success: true,
        data: map,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'READING_PROGRESS_FETCH_FAILED',
        message: 'تعذر استرجاع سجل متابعة القراءة من الخادم المركزي.',
      },
    };
  }

  /**
   * Save reading progress for a book (POST /api/v1/reading-progress)
   */
  public async saveReadingProgress(params: {
    bookId: string;
    currentPage: number;
    totalPages: number;
  }): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const { bookId, currentPage, totalPages } = params;
    const percentage = Math.min(100, Math.round((currentPage / (totalPages || 1)) * 100));
    const isCompleted = currentPage >= totalPages && totalPages > 0;

    const res = await apiClient.post('/reading-progress', {
      bookId,
      currentPage,
      totalPages,
      percentage,
      isCompleted,
    });
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'READING_PROGRESS_SAVE_FAILED',
        message: 'تعذر حفظ تقدم القراءة في الخادم المركزي.',
      },
    };
  }

  /**
   * Dismiss reading progress for a book (POST /api/v1/reading-progress/dismiss)
   */
  public async dismissReadingProgress(bookId: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post('/reading-progress/dismiss', { bookId });
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'READING_PROGRESS_DISMISS_FAILED',
        message: 'تعذر إخفاء تقدم القراءة في الخادم المركزي.',
      },
    };
  }

  /**
   * Clear all completed reading progress items (POST /api/v1/reading-progress/clear-completed)
   */
  public async clearCompletedReading(): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post('/reading-progress/clear-completed');
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'READING_PROGRESS_CLEAR_FAILED',
        message: 'تعذر تنظيف سجلات القراءة المكتملة في الخادم المركزي.',
      },
    };
  }

  /**
   * Delete reading progress for a specific book (DELETE /api/v1/reading-progress/:bookId)
   */
  public async deleteReadingProgress(bookId: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.delete(`/reading-progress/${bookId}`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'READING_PROGRESS_DELETE_FAILED',
        message: 'تعذر حذف سجل القراءة من الخادم المركزي.',
      },
    };
  }
}

export const readingProgressRepository = new ReadingProgressRepository();
