/**
 * Mishkat Central Server Print Request Repository
 * Manages digital book print requests and librarian processing via apiClient.
 */

import { apiClient, ApiError } from './apiClient';

export interface DigitalPrintRequest {
  id: string;
  book_id: string;
  book_title: string;
  student_id: string;
  student_name: string;
  student_reg_number?: string;
  page_from: number;
  page_to: number;
  total_pages: number;
  purpose: string;
  notes?: string;
  status: 'pending' | 'approved_printing' | 'ready_for_pickup' | 'completed' | 'rejected';
  admin_notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export class PrintRequestRepository {
  public async getPrintRequests(status?: string): Promise<{
    success: boolean;
    data?: DigitalPrintRequest[];
    error?: ApiError;
  }> {
    const url = status && status !== 'all' ? `/print-requests?status=${status}` : '/print-requests';
    const res = await apiClient.get<DigitalPrintRequest[]>(url);
    if (res.success && Array.isArray(res.data)) {
      return { success: true, data: res.data };
    }
    return { success: false, error: res.error };
  }

  public async createPrintRequest(payload: {
    bookId: string;
    bookTitle: string;
    pageFrom: number;
    pageTo: number;
    purpose?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    data?: DigitalPrintRequest;
    error?: ApiError;
  }> {
    const res = await apiClient.post<DigitalPrintRequest>('/print-requests', payload);
    return res;
  }

  public async updateStatus(id: string, status: string, adminNotes?: string): Promise<{
    success: boolean;
    data?: DigitalPrintRequest;
    error?: ApiError;
  }> {
    const res = await apiClient.patch<DigitalPrintRequest>(`/print-requests/${id}/status`, { status, adminNotes });
    return res;
  }

  public async cancelPrintRequest(id: string): Promise<{
    success: boolean;
    error?: ApiError;
  }> {
    const res = await apiClient.delete(`/print-requests/${id}`);
    return res;
  }
}

export const printRequestRepository = new PrintRequestRepository();
