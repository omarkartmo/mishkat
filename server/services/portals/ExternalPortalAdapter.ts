/**
 * MISHKAT — External Portal Adapter Base Class
 * Phase 15.4-D: Strict Source Provenance, Normalization & Isolation Enforcement
 */

import {
  IntegrationMethod,
  PortalCapabilities,
  PortalDiscoveryResult,
  PortalHealthStatus,
  PortalSearchOptions,
  VerificationResult,
  VerifiedPortalRecord,
} from './types';

export interface ExternalPortalAdapterConfig {
  portalId: string;
  portalName: string;
  baseUrl: string;
  allowedDomains: string[];
  integrationMethod: IntegrationMethod;
  capabilities?: Partial<PortalCapabilities>;
  customHeaders?: Record<string, string>;
}

export abstract class ExternalPortalAdapter {
  public readonly portalId: string;
  public readonly portalName: string;
  public readonly baseUrl: string;
  public readonly allowedDomains: string[];
  public readonly integrationMethod: IntegrationMethod;
  public readonly capabilities: PortalCapabilities;

  constructor(config: ExternalPortalAdapterConfig) {
    this.portalId = config.portalId;
    this.portalName = config.portalName;
    this.baseUrl = config.baseUrl;
    this.allowedDomains = config.allowedDomains.length > 0 ? config.allowedDomains : [new URL(config.baseUrl).hostname];
    this.integrationMethod = config.integrationMethod;
    this.capabilities = {
      searchSupported: config.capabilities?.searchSupported ?? false,
      recordLookupSupported: config.capabilities?.recordLookupSupported ?? false,
      canonicalUrlsSupported: config.capabilities?.canonicalUrlsSupported ?? false,
      metadataSupported: config.capabilities?.metadataSupported ?? false,
      fullTextSupported: config.capabilities?.fullTextSupported ?? false,
      verificationSupported: config.capabilities?.verificationSupported ?? false,
    };
  }

  /**
   * Technical discovery: Probes the portal to determine support
   */
  abstract discover(): Promise<PortalDiscoveryResult>;

  /**
   * Health check to ensure connectivity and responsiveness
   */
  abstract healthCheck(): Promise<{
    status: PortalHealthStatus;
    responseTimeMs: number;
    message?: string;
  }>;

  /**
   * Source-bound search: Only returns records strictly from this portal
   */
  abstract search(query: string, options?: PortalSearchOptions): Promise<VerifiedPortalRecord[]>;

  /**
   * Fetch single record by canonical identifier
   */
  abstract getRecord(identifier: string): Promise<VerifiedPortalRecord | null>;

  /**
   * Verify an existing record URL / identifier against real 404, soft 404, redirect, and content matching
   */
  abstract verifyRecord(record: {
    id?: string;
    recordUrl: string;
    title?: string;
    author?: string;
  }): Promise<VerificationResult>;

  /**
   * Enforces strict provenance on normalized records
   */
  protected stampProvenance(record: Omit<VerifiedPortalRecord, 'sourcePortalId' | 'sourcePortalName' | 'sourceBaseUrl' | 'sourceMethod'>): VerifiedPortalRecord {
    // INVARIANT: Every record MUST strictly originate from this adapter's portalId
    if (record.portalId !== this.portalId) {
      throw new Error(`PROVENANCE_VIOLATION: Attempted to stamp record portalId '${record.portalId}' under adapter '${this.portalId}'.`);
    }

    return {
      ...record,
      sourcePortalId: this.portalId,
      sourcePortalName: this.portalName,
      sourceBaseUrl: this.baseUrl,
      sourceMethod: this.integrationMethod,
    };
  }
}
