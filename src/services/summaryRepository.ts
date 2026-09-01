/**
 * Mishkat Central Server Summary Repository
 * Provides server-authoritative book summaries data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { BookSummary } from '../types/library';

export class SummaryRepository {
  /**
   * Fetch book summaries from Central Server (GET /api/v1/summaries)
   */
  public async getSummaries(studentId?: string): Promise<{
    success: boolean;
    data?: BookSummary[];
    error?: ApiError;
  }> {
    const endpoint = studentId ? `/summaries?studentId=${encodeURIComponent(studentId)}` : '/summaries';
    const res = await apiClient.get<BookSummary[]>(endpoint);
    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SUMMARIES_FETCH_FAILED',
        message: 'تعذر استرجاع ملخصات الكتب من الخادم المركزي.',
      },
    };
  }

  /**
   * Create or update a book summary (POST /api/v1/summaries)
   */
  public async saveSummary(summary: Partial<BookSummary> & { bookId: string; bookTitle: string }): Promise<{
    success: boolean;
    data?: BookSummary;
    error?: ApiError;
  }> {
    const res = await apiClient.post<BookSummary>('/summaries', summary);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SUMMARY_SAVE_FAILED',
        message: 'تعذر حفظ ملخص الكتاب في الخادم المركزي.',
      },
    };
  }

  /**
   * Delete a book summary (DELETE /api/v1/summaries/:id)
   */
  public async deleteSummary(id: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.delete(`/summaries/${id}`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SUMMARY_DELETE_FAILED',
        message: 'تعذر حذف ملخص الكتاب من الخادم المركزي.',
      },
    };
  }
}

export const summaryRepository = new SummaryRepository();
