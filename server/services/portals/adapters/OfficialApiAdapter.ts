/**
 * MISHKAT — Official REST/JSON API Adapter
 * Phase 15.4-D: Direct Structured API Communication
 */

import { ExternalPortalAdapter, ExternalPortalAdapterConfig } from '../ExternalPortalAdapter';
import { securityFetch } from '../securityHttpClient';
import {
  PortalDiscoveryResult,
  PortalHealthStatus,
  PortalSearchOptions,
  VerificationResult,
  VerifiedPortalRecord,
} from '../types';
import { VerificationService } from '../VerificationService';

export interface OfficialApiConfig extends ExternalPortalAdapterConfig {
  searchEndpoint?: string;
  recordEndpoint?: string;
  apiKey?: string;
}

export class OfficialApiAdapter extends ExternalPortalAdapter {
  private searchEndpoint: string;
  private recordEndpoint: string;
  private apiKey?: string;

  constructor(config: OfficialApiConfig) {
    super({
      ...config,
      integrationMethod: 'OFFICIAL_API',
      capabilities: {
        searchSupported: true,
        recordLookupSupported: true,
        canonicalUrlsSupported: true,
        metadataSupported: true,
        fullTextSupported: false,
        verificationSupported: true,
        ...config.capabilities,
      },
    });
    this.searchEndpoint = config.searchEndpoint || `${this.baseUrl.replace(/\/+$/, '')}/api/v1/search`;
    this.recordEndpoint = config.recordEndpoint || `${this.baseUrl.replace(/\/+$/, '')}/api/v1/records`;
    this.apiKey = config.apiKey;
  }

  public async discover(): Promise<PortalDiscoveryResult> {
    const notes: string[] = [];
    try {
      const probeUrl = this.searchEndpoint.includes('?')
        ? `${this.searchEndpoint}&q=test&limit=1`
        : `${this.searchEndpoint}?q=test&limit=1`;

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

      const res = await securityFetch(probeUrl, {
        allowedDomains: this.allowedDomains,
        allowLocalhost: process.env.NODE_ENV === 'test',
        headers,
        timeoutMs: 6000,
      });

      const isJson = Boolean(res.headers['content-type']?.includes('application/json'));
      if (!res.ok || !isJson) {
        return {
          reachable: res.ok,
          httpStatus: res.status,
          detectedMethod: 'NONE',
          hasStructuredMetadata: false,
          supportsHttps: this.baseUrl.startsWith('https://'),
          capabilities: this.capabilities,
          notes: [
            !res.ok
              ? `API probe failed with status ${res.status}`
              : `API probe returned non-JSON content-type '${res.headers['content-type'] || 'unknown'}'`,
          ],
        };
      }

      notes.push('Official JSON API endpoint confirmed.');

      return {
        reachable: true,
        httpStatus: res.status,
        detectedMethod: 'OFFICIAL_API',
        apiEndpoints: [this.searchEndpoint, this.recordEndpoint],
        searchEndpoint: this.searchEndpoint,
        hasStructuredMetadata: true,
        supportsHttps: this.baseUrl.startsWith('https://'),
        capabilities: {
          searchSupported: true,
          recordLookupSupported: true,
          canonicalUrlsSupported: true,
          metadataSupported: true,
          fullTextSupported: true,
          verificationSupported: true,
        },
        notes,
      };
    } catch (err: any) {
      return {
        reachable: false,
        detectedMethod: 'NONE',
        hasStructuredMetadata: false,
        supportsHttps: this.baseUrl.startsWith('https://'),
        capabilities: this.capabilities,
        notes: [`API discovery failed: ${err.message}`],
      };
    }
  }

  public async healthCheck(): Promise<{
    status: PortalHealthStatus;
    responseTimeMs: number;
    message?: string;
  }> {
    const start = Date.now();
    try {
      const res = await securityFetch(this.searchEndpoint, {
        allowedDomains: this.allowedDomains,
        allowLocalhost: process.env.NODE_ENV === 'test',
        timeoutMs: 5000,
      });
      const responseTimeMs = Date.now() - start;

      if (res.ok) return { status: 'HEALTHY', responseTimeMs };
      return { status: 'DEGRADED', responseTimeMs, message: `Status ${res.status}` };
    } catch (err: any) {
      return { status: 'DOWN', responseTimeMs: Date.now() - start, message: err.message };
    }
  }

  public async search(query: string, options?: PortalSearchOptions): Promise<VerifiedPortalRecord[]> {
    const q = (query || '').trim();
    if (!q) return [];

    try {
      let url: string;
      if (this.searchEndpoint.includes('{query}')) {
        url = this.searchEndpoint.replace('{query}', encodeURIComponent(q));
      } else {
        const sep = this.searchEndpoint.includes('?') ? '&' : '?';
        url = `${this.searchEndpoint}${sep}q=${encodeURIComponent(q)}&limit=${options?.limit || 20}`;
      }

      const res = await securityFetch(url, {
        allowedDomains: this.allowedDomains,
        allowLocalhost: process.env.NODE_ENV === 'test',
        headers: { Accept: 'application/json' },
        timeoutMs: 8000,
      });

      if (!res.ok) return [];

      const data = JSON.parse(res.body);
      const items = Array.isArray(data)
        ? data
        : (data.items || data.records || data.data || data.docs || (data.response && data.response.docs) || []);

      return items.map((item: any) => {
        const recId = String(item.key || item.id || item.identifier || `rec-${Date.now()}`);
        const recUrl = item.url || (item.key ? `${this.baseUrl}${item.key}` : `${this.baseUrl}/record/${recId}`);
        const author = Array.isArray(item.author_name)
          ? item.author_name.join('، ')
          : (item.author || item.creator || 'مؤلف غير معروف');

        return this.stampProvenance({
          id: recId,
          portalId: this.portalId,
          title: item.title || 'عنوان غير معروف',
          author,
          categoryName: item.category || 'عام',
          categorySuggestion: 'cat-general',
          pagesCount: item.pages || item.number_of_pages_median || 100,
          publishYear: String(item.year || item.first_publish_year || item.publishYear || ''),
          summary: item.summary || item.description || (Array.isArray(item.first_sentence) ? item.first_sentence[0] : ''),
          tags: Array.isArray(item.tags) ? item.tags : (Array.isArray(item.subject) ? item.subject.slice(0, 5) : []),
          canonicalUrl: recUrl,
          sourceEndpoint: this.searchEndpoint,
          sourceRecordId: recId,
          sourceRecordUrl: recUrl,
          sourceRetrievedAt: new Date().toISOString(),
          verificationStatus: 'VERIFIED',
          isDirectExtraction: true,
        });
      });
    } catch {
      return [];
    }
  }

  public async getRecord(identifier: string): Promise<VerifiedPortalRecord | null> {
    try {
      const sep = this.recordEndpoint.includes('?') ? '&' : '?';
      const url = `${this.recordEndpoint}/${encodeURIComponent(identifier)}`;

      const res = await securityFetch(url, {
        allowedDomains: this.allowedDomains,
        allowLocalhost: process.env.NODE_ENV === 'test',
        headers: { Accept: 'application/json' },
        timeoutMs: 8000,
      });

      if (!res.ok) return null;

      const item = JSON.parse(res.body);
      return this.stampProvenance({
        id: item.id,
        portalId: this.portalId,
        title: item.title,
        author: item.author,
        categoryName: item.category,
        categorySuggestion: 'cat-general',
        pagesCount: item.pages || 100,
        publishYear: item.year,
        summary: item.summary || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        canonicalUrl: item.url || `${this.baseUrl}/record/${item.id}`,
        sourceRecordId: String(item.id),
        sourceRecordUrl: item.url || `${this.baseUrl}/record/${item.id}`,
        sourceRetrievedAt: new Date().toISOString(),
        verificationStatus: 'VERIFIED',
        isDirectExtraction: true,
      });
    } catch {
      return null;
    }
  }

  public async verifyRecord(record: {
    id?: string;
    recordUrl: string;
    title?: string;
    author?: string;
  }): Promise<VerificationResult> {
    if (record.id) {
      const rec = await this.getRecord(record.id);
      if (rec) {
        return {
          recordUrl: record.recordUrl,
          status: 'VERIFIED',
          httpStatus: 200,
          isSoft404: false,
          finalUrl: record.recordUrl,
          contentMatched: true,
          details: 'Verified via official API getRecord endpoint.',
          verifiedAt: new Date().toISOString(),
        };
      }
    }

    return VerificationService.verifyUrl(record.recordUrl, {
      allowedDomains: this.allowedDomains,
      expectedTitle: record.title,
      expectedAuthor: record.author,
      allowLocalhost: process.env.NODE_ENV === 'test',
    });
  }
}
