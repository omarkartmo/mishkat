/**
 * Mishkat Central Server Loan Request Repository
 * Provides server-authoritative loan request data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { PhysicalLoanRequest } from '../types/library';

export interface CreateLoanRequestPayload {
  bookId: string;
  purpose?: string;
  customReason?: string;
  requestedDurationDays?: number;
}

export interface ApproveLoanRequestPayload {
  approvedDurationDays?: number;
  adminNotes?: string;
}

export interface RejectLoanRequestPayload {
  rejectionReason?: string;
}

export class LoanRequestRepository {
  /**
   * Fetch loan requests from the Central Server (GET /api/v1/loan-requests)
   * Students automatically receive only their own requests; Admins receive all.
   */
  public async getLoanRequests(): Promise<{
    success: boolean;
    data?: PhysicalLoanRequest[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<PhysicalLoanRequest[]>('/loan-requests');
    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LOAN_REQUESTS_FETCH_FAILED',
        message: 'تعذر استرجاع طلبات الإعارة من الخادم المركزي.',
      },
    };
  }

  /**
   * Submit a new loan request (POST /api/v1/loan-requests)
   */
  public async createLoanRequest(payload: CreateLoanRequestPayload): Promise<{
    success: boolean;
    data?: PhysicalLoanRequest;
    error?: ApiError;
  }> {
    const res = await apiClient.post<PhysicalLoanRequest>('/loan-requests', payload);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LOAN_REQUEST_CREATE_FAILED',
        message: 'تعذر إرسال طلب الاستعارة إلى الخادم المركزي.',
      },
    };
  }

  /**
   * Approve a loan request (POST /api/v1/loan-requests/:id/approve)
   */
  public async approveLoanRequest(
    requestId: string,
    payload: ApproveLoanRequestPayload
  ): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post(`/loan-requests/${requestId}/approve`, payload);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LOAN_REQUEST_APPROVE_FAILED',
        message: 'تعذر اعتماد طلب الاستعارة في الخادم المركزي.',
      },
    };
  }

  /**
   * Reject a loan request (POST /api/v1/loan-requests/:id/reject)
   */
  public async rejectLoanRequest(
    requestId: string,
    payload: RejectLoanRequestPayload
  ): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post(`/loan-requests/${requestId}/reject`, payload);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LOAN_REQUEST_REJECT_FAILED',
        message: 'تعذر رفض طلب الاستعارة في الخادم المركزي.',
      },
    };
  }

  /**
   * Handover physical book and convert request to active loan (POST /api/v1/loan-requests/:id/handover)
   */
  public async confirmHandover(requestId: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post(`/loan-requests/${requestId}/handover`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LOAN_REQUEST_HANDOVER_FAILED',
        message: 'تعذر تأكيد تسليم الكتاب في الخادم المركزي.',
      },
    };
  }
}

export const loanRequestRepository = new LoanRequestRepository();
