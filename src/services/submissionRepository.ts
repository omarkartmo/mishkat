/**
 * Mishkat Central Server Submission Repository
 * Provides server-authoritative book submissions data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { PendingBookSubmission } from '../types/library';

export class SubmissionRepository {
  /**
   * Fetch submissions from Central Server (GET /api/v1/submissions)
   */
  public async getSubmissions(): Promise<{
    success: boolean;
    data?: PendingBookSubmission[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<PendingBookSubmission[]>('/submissions');
    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SUBMISSIONS_FETCH_FAILED',
        message: 'تعذر استرجاع قائمة الاقتراحات من الخادم المركزي.',
      },
    };
  }

  /**
   * Create a new book submission (POST /api/v1/submissions)
   */
  public async createSubmission(submission: Partial<PendingBookSubmission>): Promise<{
    success: boolean;
    data?: PendingBookSubmission;
    error?: ApiError;
  }> {
    const res = await apiClient.post<PendingBookSubmission>('/submissions', submission);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SUBMISSION_CREATE_FAILED',
        message: 'تعذر إرسال اقتراح الكتاب إلى الخادم المركزي.',
      },
    };
  }

  /**
   * Approve a book submission (POST /api/v1/submissions/:id/approve)
   */
  public async approveSubmission(id: string, options?: { categoryId?: string; adminFeedback?: string }): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post(`/submissions/${id}/approve`, options || {});
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SUBMISSION_APPROVE_FAILED',
        message: 'تعذر اعتماد الاقتراح في الخادم المركزي.',
      },
    };
  }

  /**
   * Reject a book submission (POST /api/v1/submissions/:id/reject)
   */
  public async rejectSubmission(id: string, reason: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post(`/submissions/${id}/reject`, { reason });
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SUBMISSION_REJECT_FAILED',
        message: 'تعذر رفض الاقتراح في الخادم المركزي.',
      },
    };
  }
}

export const submissionRepository = new SubmissionRepository();
