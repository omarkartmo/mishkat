/**
 * MISHKAT — Portal Adapter Manager & Registry
 * Phase 15.4-D: Central Portal Orchestrator & Invariant Enforcer
 */

import { db } from '../../db/pool';
import { ExternalPortalAdapter } from './ExternalPortalAdapter';
import { OaiPmhAdapter } from './adapters/OaiPmhAdapter';
import { OfficialApiAdapter } from './adapters/OfficialApiAdapter';
import { OfficialSearchEndpointAdapter } from './adapters/OfficialSearchEndpointAdapter';
import { VerifiedCatalogAdapter } from './adapters/VerifiedCatalogAdapter';
import { DiscoveryEngine } from './DiscoveryEngine';
import { OnboardingTestSuite } from './OnboardingTestSuite';
import {
  OnboardingTestReport,
  PortalDiscoveryResult,
  PortalSearchOptions,
  VerificationResult,
  VerifiedPortalRecord,
} from './types';

export class PortalManager {
  private static adapterCache = new Map<string, ExternalPortalAdapter>();

  /**
   * Resolves or instantiates an adapter for a given portalId
   */
  public static async getAdapter(portalId: string): Promise<ExternalPortalAdapter | null> {
    if (this.adapterCache.has(portalId)) {
      return this.adapterCache.get(portalId)!;
    }

    // Check database for portal definition
    const { rows } = await db.query('SELECT * FROM whitelisted_portals WHERE id = $1', [portalId]);
    if (rows.length === 0) {
      return null;
    }

    const portal = rows[0];
    const allowedDomains = Array.isArray(portal.allowed_domains) ? portal.allowed_domains : [];
    const integrationMethod = portal.integration_method || 'NONE';

    let adapter: ExternalPortalAdapter;

    if (
      integrationMethod === 'MANUAL_VERIFIED_CATALOG' ||
      ['portal-ibadi', 'portal-shamela', 'portal-arabic-academy', 'portal-school-research'].includes(portal.id)
    ) {
      adapter = new VerifiedCatalogAdapter({
        portalId: portal.id,
        portalName: portal.name,
        baseUrl: portal.url,
        allowedDomains,
        integrationMethod: 'MANUAL_VERIFIED_CATALOG',
        capabilities: portal.capabilities,
      });
    } else if (integrationMethod === 'OAI_PMH') {
      adapter = new OaiPmhAdapter({
        portalId: portal.id,
        portalName: portal.name,
        baseUrl: portal.url,
        allowedDomains,
        integrationMethod: 'OAI_PMH',
        capabilities: portal.capabilities,
      });
    } else if (integrationMethod === 'OFFICIAL_API') {
      adapter = new OfficialApiAdapter({
        portalId: portal.id,
        portalName: portal.name,
        baseUrl: portal.url,
        allowedDomains,
        integrationMethod: 'OFFICIAL_API',
        capabilities: portal.capabilities,
      });
    } else if (integrationMethod === 'OFFICIAL_SEARCH_ENDPOINT') {
      const template = portal.discovery_details?.searchEndpoint || `${portal.url}/search?q={query}`;
      adapter = new OfficialSearchEndpointAdapter({
        portalId: portal.id,
        portalName: portal.name,
        baseUrl: portal.url,
        allowedDomains,
        integrationMethod: 'OFFICIAL_SEARCH_ENDPOINT',
        capabilities: portal.capabilities,
        searchUrlTemplate: template,
      });
    } else {
      // Default to VerifiedCatalogAdapter if ID matches, else fallback
      adapter = new VerifiedCatalogAdapter({
        portalId: portal.id,
        portalName: portal.name,
        baseUrl: portal.url,
        allowedDomains,
        integrationMethod: 'MANUAL_VERIFIED_CATALOG',
      });
    }

    this.adapterCache.set(portalId, adapter);
    return adapter;
  }

  /**
   * Strictly source-bound search
   * Invariant: every returned result MUST originate strictly from portalId.
   */
  public static async searchPortal(
    portalId: string,
    query: string,
    options?: PortalSearchOptions
  ): Promise<VerifiedPortalRecord[]> {
    const adapter = await this.getAdapter(portalId);
    if (!adapter) {
      return [];
    }

    const results = await adapter.search(query, options);

    // Architectural Invariant check
    for (const r of results) {
      if (r.sourcePortalId !== portalId) {
        throw new Error(
          `INVARIANT_BREACH: Record '${r.title}' has sourcePortalId '${r.sourcePortalId}', expected strictly '${portalId}'.`
        );
      }
    }

    return results;
  }

  /**
   * Verify record against adapter
   */
  public static async verifyRecord(
    portalId: string,
    record: { id?: string; recordUrl: string; title?: string; author?: string }
  ): Promise<VerificationResult> {
    const adapter = await this.getAdapter(portalId);
    if (!adapter) {
      return {
        recordUrl: record.recordUrl,
        status: 'ERROR',
        details: `Portal with ID '${portalId}' is not configured or whitelisted.`,
        verifiedAt: new Date().toISOString(),
      };
    }

    return adapter.verifyRecord(record);
  }

  /**
   * Runs the 12-test technical onboarding suite for a portal
   */
  public static async testPortal(portalId: string): Promise<OnboardingTestReport> {
    const adapter = await this.getAdapter(portalId);
    if (!adapter) {
      throw new Error(`PORTAL_NOT_FOUND: Portal with ID '${portalId}' does not exist.`);
    }

    const report = await OnboardingTestSuite.runSuite(adapter);

    // Update portal status and details in DB
    await db.query(
      `
      UPDATE whitelisted_portals
      SET status = $1,
          integration_method = $2,
          capabilities = $3,
          last_verified_at = CURRENT_TIMESTAMP,
          discovery_details = $4,
          health_status = $5
      WHERE id = $6
    `,
      [
        report.suggestedStatus,
        report.suggestedMethod,
        JSON.stringify(report.capabilities),
        JSON.stringify({ report, timestamp: report.timestamp }),
        report.allPassed ? 'HEALTHY' : 'DEGRADED',
        portalId,
      ]
    );

    return report;
  }

  /**
   * Probes URL to preview discovery before portal creation
   */
  public static async discoverPreview(url: string, allowedDomains?: string[]): Promise<PortalDiscoveryResult> {
    return DiscoveryEngine.discoverPortal(url, {
      allowedDomains,
      allowLocalhost: process.env.NODE_ENV === 'test',
    });
  }

  /**
   * Clears cached adapter instances when portal configurations change
   */
  public static invalidateCache(portalId?: string): void {
    if (portalId) {
      this.adapterCache.delete(portalId);
    } else {
      this.adapterCache.clear();
    }
  }
}
