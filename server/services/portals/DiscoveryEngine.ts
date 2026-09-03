/**
 * MISHKAT — Portal Technical Discovery Engine
 * Phase 15.4-D: Prioritized API, OAI-PMH, Search Endpoint & Metadata Probing
 */

import { securityFetch } from './securityHttpClient';
import { IntegrationMethod, PortalCapabilities, PortalDiscoveryResult } from './types';

export class DiscoveryEngine {
  /**
   * Discovers the optimal integration method for a target portal URL.
   * Priority:
   * 1. Official API (REST/JSON)
   * 2. OAI-PMH (Dublin Core XML)
   * 3. Official Search Endpoint
   * 4. Public Structured Metadata
   * 5. None / Unsupported
   */
  public static async discoverPortal(
    urlStr: string,
    options: { allowedDomains?: string[]; allowLocalhost?: boolean } = {}
  ): Promise<PortalDiscoveryResult> {
    const notes: string[] = [];
    const cleanUrl = urlStr.trim().replace(/\/+$/, '');
    const isLocal = options.allowLocalhost ?? (process.env.NODE_ENV === 'test');

    // 1. Initial connectivity probe
    let homeRes;
    try {
      homeRes = await securityFetch(cleanUrl, {
        allowedDomains: options.allowedDomains,
        allowLocalhost: isLocal,
        timeoutMs: 6000,
      });
      notes.push(`Portal home responded with HTTP ${homeRes.status}.`);
    } catch (err: any) {
      return {
        reachable: false,
        detectedMethod: 'NONE',
        hasStructuredMetadata: false,
        supportsHttps: cleanUrl.startsWith('https://'),
        capabilities: this.getEmptyCapabilities(),
        notes: [`Connection failed: ${err.message}`],
      };
    }

    if (!homeRes.ok && homeRes.status !== 403) {
      return {
        reachable: false,
        httpStatus: homeRes.status,
        detectedMethod: 'NONE',
        hasStructuredMetadata: false,
        supportsHttps: cleanUrl.startsWith('https://'),
        capabilities: this.getEmptyCapabilities(),
        notes: [`Portal responded with non-success HTTP status ${homeRes.status}.`],
      };
    }

    // Check if robots.txt or portal explicitly blocks bots
    if (homeRes.status === 403 || homeRes.body.includes('Access Denied') || homeRes.body.includes('Cloudflare')) {
      notes.push('Portal indicated access restrictions / automated request blocking.');
    }

    // 2. Priority 1 — Official API
    const apiProbePaths = ['/api/v1/search', '/api/records', '/api/v1/records', '/api/books'];
    for (const p of apiProbePaths) {
      try {
        const apiUrl = `${cleanUrl}${p}`;
        const apiRes = await securityFetch(`${apiUrl}?q=test&limit=1`, {
          allowedDomains: options.allowedDomains,
          allowLocalhost: isLocal,
          headers: { Accept: 'application/json' },
          timeoutMs: 4000,
        });

        if (apiRes.ok && apiRes.headers['content-type']?.includes('application/json')) {
          notes.push(`Official JSON API discovered at '${p}'.`);
          return {
            reachable: true,
            httpStatus: 200,
            detectedMethod: 'OFFICIAL_API',
            capabilityType: 'LIVE_OFFICIAL_API',
            apiEndpoints: [apiUrl],
            searchEndpoint: apiUrl,
            hasStructuredMetadata: true,
            supportsHttps: cleanUrl.startsWith('https://'),
            capabilities: {
              searchSupported: true,
              recordLookupSupported: true,
              canonicalUrlsSupported: true,
              metadataSupported: true,
              fullTextSupported: true,
              verificationSupported: true,
              isLiveSearchSupported: true,
              isStaticSnapshot: false,
              isBrowseOnly: false,
            },
            notes,
          };
        }
      } catch {
        // Continue probing next priority
      }
    }

    // 3. Priority 2 — OAI-PMH
    const oaiProbePaths = ['/oai', '/oai-pmh', '/oai/request', '/oai2'];
    for (const op of oaiProbePaths) {
      try {
        const oaiUrl = `${cleanUrl}${op}?verb=Identify`;
        const oaiRes = await securityFetch(oaiUrl, {
          allowedDomains: options.allowedDomains,
          allowLocalhost: isLocal,
          timeoutMs: 4000,
        });

        if (oaiRes.ok && oaiRes.body.includes('<OAI-PMH')) {
          notes.push(`OAI-PMH repository protocol confirmed at '${op}'.`);
          return {
            reachable: true,
            httpStatus: 200,
            detectedMethod: 'OAI_PMH',
            capabilityType: 'LIVE_OAI_PMH',
            oaiPmhBaseUrl: `${cleanUrl}${op}`,
            hasStructuredMetadata: true,
            supportsHttps: cleanUrl.startsWith('https://'),
            capabilities: {
              searchSupported: true,
              recordLookupSupported: true,
              canonicalUrlsSupported: true,
              metadataSupported: true,
              fullTextSupported: false,
              verificationSupported: true,
              isLiveSearchSupported: true,
              isStaticSnapshot: false,
              isBrowseOnly: false,
            },
            notes,
          };
        }
      } catch {
        // Continue probing next
      }
    }

    // 4. Priority 3 — Official Search Endpoint
    const searchProbePaths = ['/search?q=test', '/catalog/search?q=test', '/find?q=test'];
    for (const sp of searchProbePaths) {
      try {
        const sUrl = `${cleanUrl}${sp}`;
        const searchRes = await securityFetch(sUrl, {
          allowedDomains: options.allowedDomains,
          allowLocalhost: isLocal,
          timeoutMs: 4000,
        });

        if (searchRes.ok && !searchRes.body.includes('404')) {
          const template = `${cleanUrl}${sp.split('?')[0]}?q={query}`;
          notes.push(`Official Search Endpoint confirmed at '${sp}'.`);
          return {
            reachable: true,
            httpStatus: searchRes.status,
            detectedMethod: 'OFFICIAL_SEARCH_ENDPOINT',
            capabilityType: 'LIVE_OFFICIAL_SEARCH',
            searchEndpoint: template,
            hasStructuredMetadata: false,
            supportsHttps: cleanUrl.startsWith('https://'),
            capabilities: {
              searchSupported: true,
              recordLookupSupported: false,
              canonicalUrlsSupported: true,
              metadataSupported: false,
              fullTextSupported: false,
              verificationSupported: true,
              isLiveSearchSupported: true,
              isStaticSnapshot: false,
              isBrowseOnly: false,
            },
            notes,
          };
        }
      } catch {
        // Continue
      }
    }

    // 5. Priority 4 — Structured Metadata on Homepage (JSON-LD / Schema.org)
    if (homeRes.body.includes('application/ld+json') || homeRes.body.includes('schema.org/Book')) {
      notes.push('Structured metadata (JSON-LD / Schema.org) detected.');
      return {
        reachable: true,
        httpStatus: homeRes.status,
        detectedMethod: 'STRUCTURED_METADATA',
        capabilityType: 'LIVE_STRUCTURED_METADATA',
        hasStructuredMetadata: true,
        supportsHttps: cleanUrl.startsWith('https://'),
        capabilities: {
          searchSupported: false,
          recordLookupSupported: true,
          canonicalUrlsSupported: true,
          metadataSupported: true,
          fullTextSupported: false,
          verificationSupported: true,
          isLiveSearchSupported: false,
          isStaticSnapshot: false,
          isBrowseOnly: true,
        },
        notes,
      };
    }

    // 6. Strict principle: DO NOT INVENT AN API.
    notes.push('No official API, OAI-PMH, or verifiable search endpoint detected. Classified as BROWSE_ONLY.');
    return {
      reachable: true,
      httpStatus: homeRes.status,
      detectedMethod: 'NONE',
      capabilityType: 'BROWSE_ONLY',
      hasStructuredMetadata: false,
      supportsHttps: cleanUrl.startsWith('https://'),
      capabilities: {
        ...this.getEmptyCapabilities(),
        isLiveSearchSupported: false,
        isStaticSnapshot: false,
        isBrowseOnly: true,
      },
      notes,
    };
  }

  private static getEmptyCapabilities(): PortalCapabilities {
    return {
      searchSupported: false,
      recordLookupSupported: false,
      canonicalUrlsSupported: false,
      metadataSupported: false,
      fullTextSupported: false,
      verificationSupported: false,
    };
  }
}
