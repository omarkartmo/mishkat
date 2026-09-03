/**
 * Mishkat Central Server Portal Repository
 * Provides server-authoritative whitelisted educational portals data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { WhitelistedPortal } from '../types/library';

export class PortalRepository {
  /**
   * Fetch whitelisted portals from Central Server (GET /api/v1/portals)
   */
  public async getPortals(): Promise<{
    success: boolean;
    data?: WhitelistedPortal[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<WhitelistedPortal[]>('/portals');
    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'PORTALS_FETCH_FAILED',
        message: 'تعذر استرجاع بوابات المعرفة من الخادم المركزي.',
      },
    };
  }

  /**
   * Create a new portal (POST /api/v1/portals)
   */
  public async createPortal(portal: Omit<WhitelistedPortal, 'id'>): Promise<{
    success: boolean;
    data?: WhitelistedPortal;
    error?: ApiError;
  }> {
    const res = await apiClient.post<WhitelistedPortal>('/portals', portal);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'PORTAL_CREATE_FAILED',
        message: 'تعذر إضافة بوابة المعرفة في الخادم المركزي.',
      },
    };
  }

  /**
   * Update an existing portal (PUT /api/v1/portals/:id)
   */
  public async updatePortal(id: string, updates: Partial<WhitelistedPortal>): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.put(`/portals/${id}`, updates);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'PORTAL_UPDATE_FAILED',
        message: 'تعذر تحديث بوابة المعرفة في الخادم المركزي.',
      },
    };
  }

  /**
   * Delete a portal (DELETE /api/v1/portals/:id)
   */
  public async deletePortal(id: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.delete(`/portals/${id}`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'PORTAL_DELETE_FAILED',
        message: 'تعذر حذف بوابة المعرفة من الخادم المركزي.',
      },
    };
  }

  /**
   * Toggle featured status of a portal
   */
  public async togglePortalFeatured(portal: WhitelistedPortal): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    return this.updatePortal(portal.id, {
      ...portal,
      isFeatured: !portal.isFeatured,
    });
  }

  /**
   * Technical preview discovery for an external portal URL before adding
   */
  public async discoverPreview(url: string, allowedDomains?: string[]): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post('/portals/discover-preview', { url, allowedDomains });
    return res;
  }

  /**
   * Run the 12-test technical onboarding suite for a portal
   */
  public async runTests(id: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post(`/portals/${id}/run-tests`, {});
    return res;
  }

  /**
   * Live record verification
   */
  public async verifyRecord(payload: {
    portalId?: string;
    recordUrl: string;
    title?: string;
    author?: string;
    recordId?: string;
  }): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.post('/portals/verify-record', payload);
    return res;
  }

  /**
   * Strictly source-bound portal search
   */
  public async searchPortal(id: string, query: string, category?: string): Promise<{
    success: boolean;
    data?: any[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<any[]>(`/portals/${id}/search?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category || 'all')}`);
    return res;
  }
}

export const portalRepository = new PortalRepository();
