/**
 * Mishkat Central Server Submission Repository
 * Provides server-authoritative book submissions data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { PendingBookSubmission, SubmissionStatus } from '../types/library';

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
   * Review a book submission via canonical review endpoint (POST /api/v1/submissions/:id/review)
   */
  public async reviewSubmission(
    id: string,
    review: {
      status: SubmissionStatus | 'approved' | 'rejected' | 'pending';
      adminFeedback?: string;
      categoryId?: string;
      title?: string;
      author?: string;
      manualFilePath?: string;
    }
  ): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post(`/submissions/${id}/review`, review);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'SUBMISSION_REVIEW_FAILED',
        message: 'تعذر مراجعة الاقتراح في الخادم المركزي.',
      },
    };
  }

  /**
   * Approve a book submission (Case A auto-download or Case B final approval)
   */
  public async approveSubmission(
    id: string,
    options?: { categoryId?: string; adminFeedback?: string; title?: string; author?: string; manualFilePath?: string }
  ): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    return this.reviewSubmission(id, {
      status: 'APPROVED',
      categoryId: options?.categoryId,
      adminFeedback: options?.adminFeedback,
      title: options?.title,
      author: options?.author,
      manualFilePath: options?.manualFilePath,
    });
  }

  /**
   * Transition suggestion to NEEDS_MANUAL_ACQUISITION (Section 9 Requirement)
   */
  public async markManualAcquisition(
    id: string,
    options?: { adminFeedback?: string; title?: string; author?: string; categoryId?: string }
  ): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    return this.reviewSubmission(id, {
      status: 'NEEDS_MANUAL_ACQUISITION',
      adminFeedback: options?.adminFeedback,
      title: options?.title,
      author: options?.author,
      categoryId: options?.categoryId,
    });
  }

  /**
   * Transition suggestion to READY_FOR_FINAL_APPROVAL (Section 9 Requirement)
   */
  public async readyFinalApproval(
    id: string,
    manualFilePath?: string
  ): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    return this.reviewSubmission(id, {
      status: 'READY_FOR_FINAL_APPROVAL',
      manualFilePath,
    });
  }

  /**
   * Reject a book submission (POST /api/v1/submissions/:id/review)
   */
  public async rejectSubmission(id: string, reason: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    return this.reviewSubmission(id, {
      status: 'REJECTED',
      adminFeedback: reason,
    });
  }

  /**
   * Edit suggestion metadata (PUT /api/v1/submissions/:id)
   */
  public async updateMetadata(id: string, updates: Partial<PendingBookSubmission>): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.put(`/submissions/${id}`, updates);
    if (res.success) {
      return { success: true, data: res.data };
    }
    return {
      success: false,
      error: res.error || { code: 'UPDATE_FAILED', message: 'فشل تحديث بيانات الاقتراح.' },
    };
  }
}

export const submissionRepository = new SubmissionRepository();
