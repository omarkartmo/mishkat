/**
 * Mishkat Central Server Loan Repository
 * Provides server-authoritative loan data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { LoanRecord, LoanPurpose, SystemConfig, User } from '../types/library';

export interface CreateLoanPayload {
  bookId: string;
  studentId: string;
  purpose?: LoanPurpose;
  customDurationDays?: number;
  notes?: string;
  isOverrideExemption?: boolean;
  overrideReason?: string;
}

export interface ExtendLoanPayload {
  additionalDays?: number;
  notes?: string;
}

export interface ReturnLoanPayload {
  notes?: string;
}

export interface StudentEligibilityResult {
  canBorrow: boolean;
  reason?: string;
  activeLoansCount: number;
  hasOverdue: boolean;
}

export class LoanRepository {
  /**
   * Fetch loans from the Central Server (GET /api/v1/loans)
   * Students automatically receive only their own loans; Admins/Librarians receive all loans or filtered.
   */
  public async getLoans(params?: { studentId?: string; status?: string }): Promise<{
    success: boolean;
    data?: LoanRecord[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<LoanRecord[]>('/loans', params);
    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LOANS_FETCH_FAILED',
        message: 'تعذر استرجاع سجل الإعارات من الخادم المركزي.',
      },
    };
  }

  /**
   * Create / Issue a new loan on Central Server (POST /api/v1/loans)
   */
  public async createLoan(payload: CreateLoanPayload): Promise<{
    success: boolean;
    data?: LoanRecord;
    error?: ApiError;
  }> {
    const res = await apiClient.post<LoanRecord>('/loans', payload);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LOAN_CREATE_FAILED',
        message: 'تعذر تسجيل الإعارة في الخادم المركزي.',
      },
    };
  }

  /**
   * Extend a loan on Central Server (PUT /api/v1/loans/:id/extend)
   */
  public async extendLoan(
    loanId: string,
    payload: ExtendLoanPayload
  ): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.put(`/loans/${loanId}/extend`, payload);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LOAN_EXTEND_FAILED',
        message: 'تعذر تمديد الإعارة في الخادم المركزي.',
      },
    };
  }

  /**
   * Return a book / close loan on Central Server (PUT /api/v1/loans/:id/return)
   */
  public async returnLoan(
    loanId: string,
    payload: ReturnLoanPayload = {}
  ): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.put(`/loans/${loanId}/return`, payload);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'LOAN_RETURN_FAILED',
        message: 'تعذر تسجيل إرجاع الكتاب في الخادم المركزي.',
      },
    };
  }

  /**
   * Calculates borrowing eligibility based on central authoritative loans, students, and system config.
   */
  public checkEligibility(
    studentId: string,
    loans: LoanRecord[],
    students: User[],
    config: SystemConfig
  ): StudentEligibilityResult {
    const student = students.find((s) => s.id === studentId);
    if (!student) {
      return {
        canBorrow: false,
        reason: 'الطالب غير مسجل في النظام',
        activeLoansCount: 0,
        hasOverdue: false,
      };
    }

    const activeLoans = (loans || []).filter(
      (l) => l.studentId === studentId && l.status !== 'returned'
    );
    const hasOverdue = activeLoans.some((l) => l.status === 'overdue');

    if (student.isBlockedFromBorrowing || (hasOverdue && config?.autoBlockOverdue)) {
      return {
        canBorrow: false,
        reason:
          student.blockReason ||
          'الطالب محظور من الاستعارة بسبب وجود كتب متأخرة لم يتم إرجاعها',
        activeLoansCount: activeLoans.length,
        hasOverdue: true,
      };
    }

    if (activeLoans.length >= 3) {
      return {
        canBorrow: false,
        reason: `وصل الطالب للحد الأقصى المسموح به من الإعارات المتزامنة (3 كتب)`,
        activeLoansCount: activeLoans.length,
        hasOverdue: false,
      };
    }

    return {
      canBorrow: true,
      activeLoansCount: activeLoans.length,
      hasOverdue: false,
    };
  }
}

export const loanRepository = new LoanRepository();
