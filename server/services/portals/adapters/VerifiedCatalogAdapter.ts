/**
 * MISHKAT — Verified Catalog Adapter
 * Phase 15.4-D: Curated & Pre-Verified Academic Portals
 */

import { ExternalPortalAdapter, ExternalPortalAdapterConfig } from '../ExternalPortalAdapter';
import {
  PortalDiscoveryResult,
  PortalHealthStatus,
  PortalSearchOptions,
  VerificationResult,
  VerifiedPortalRecord,
} from '../types';
import { PORTAL_CATALOG_DATABASE, PortalBookItem } from '../../../../src/data/portalCatalogs';
import { VerificationService } from '../VerificationService';

export class VerifiedCatalogAdapter extends ExternalPortalAdapter {
  constructor(config: ExternalPortalAdapterConfig) {
    super({
      ...config,
      integrationMethod: 'MANUAL_VERIFIED_CATALOG',
      capabilities: {
        searchSupported: true,
        recordLookupSupported: true,
        canonicalUrlsSupported: true,
        metadataSupported: true,
        fullTextSupported: true,
        verificationSupported: true,
        ...config.capabilities,
      },
    });
  }

  public async discover(): Promise<PortalDiscoveryResult> {
    return {
      reachable: true,
      httpStatus: 200,
      detectedMethod: 'MANUAL_VERIFIED_CATALOG',
      hasStructuredMetadata: true,
      supportsHttps: this.baseUrl.startsWith('https://'),
      capabilities: this.capabilities,
      notes: [
        'Curated and verified academic catalog with strict source records and chapter previews.',
      ],
    };
  }

  public async healthCheck(): Promise<{
    status: PortalHealthStatus;
    responseTimeMs: number;
    message?: string;
  }> {
    return {
      status: 'HEALTHY',
      responseTimeMs: 5,
      message: 'Curated repository catalog active and responsive.',
    };
  }

  public async search(query: string, options?: PortalSearchOptions): Promise<VerifiedPortalRecord[]> {
    // STRICT SOURCE ISOLATION: Filter strictly by this portalId
    const portalItems = PORTAL_CATALOG_DATABASE.filter((b) => b.portalId === this.portalId);
    const q = (query || '').trim().toLowerCase();

    const matched = portalItems.filter((b) => {
      const matchQuery =
        !q ||
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.summary.toLowerCase().includes(q) ||
        (b.investigator && b.investigator.toLowerCase().includes(q)) ||
        (b.tags && b.tags.some((t) => t.toLowerCase().includes(q)));

      const matchCat =
        !options?.categoryFilter ||
        options.categoryFilter === 'all' ||
        b.categorySuggestion === options.categoryFilter ||
        b.categoryName.includes(options.categoryFilter);

      return matchQuery && matchCat;
    });

    return matched.map((item) => this.mapToVerifiedRecord(item));
  }

  public async getRecord(identifier: string): Promise<VerifiedPortalRecord | null> {
    const item = PORTAL_CATALOG_DATABASE.find(
      (b) => b.portalId === this.portalId && (b.id === identifier || b.sourceRecordUrl.endsWith(identifier))
    );
    if (!item) return null;
    return this.mapToVerifiedRecord(item);
  }

  public async verifyRecord(record: {
    id?: string;
    recordUrl: string;
    title?: string;
    author?: string;
  }): Promise<VerificationResult> {
    // 1. First check if it exists in curated catalog
    const localMatch = PORTAL_CATALOG_DATABASE.find(
      (b) =>
        b.portalId === this.portalId &&
        (b.id === record.id || b.sourceRecordUrl === record.recordUrl || (record.title && b.title === record.title))
    );

    if (localMatch) {
      return {
        recordUrl: localMatch.sourceRecordUrl,
        status: 'VERIFIED',
        httpStatus: 200,
        isSoft404: false,
        finalUrl: localMatch.sourceRecordUrl,
        contentMatched: true,
        details: 'Record verified against curated academic catalog with authentic chapter text.',
        verifiedAt: new Date().toISOString(),
      };
    }

    // 2. If not found in curated catalog, mark NOT_FOUND
    return {
      recordUrl: record.recordUrl,
      status: 'NOT_FOUND',
      httpStatus: 404,
      details: 'Record was not found in the verified source catalog.',
      verifiedAt: new Date().toISOString(),
    };
  }

  private mapToVerifiedRecord(item: PortalBookItem): VerifiedPortalRecord {
    return this.stampProvenance({
      id: item.id,
      portalId: item.portalId,
      title: item.title,
      author: item.author,
      categoryName: item.categoryName,
      categorySuggestion: item.categorySuggestion,
      volumeInfo: item.volumeInfo,
      pagesCount: item.pagesCount,
      publishYear: item.publishYear,
      investigator: item.investigator,
      summary: item.summary,
      tags: item.tags,
      canonicalUrl: item.sourceRecordUrl,
      sourceRecordId: item.id,
      sourceRecordUrl: item.sourceRecordUrl,
      sourceRetrievedAt: item.retrievedAt,
      verificationStatus: 'VERIFIED',
      isDirectExtraction: true,
      sampleChapters: item.sampleChapters,
    });
  }
}
