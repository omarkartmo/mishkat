/**
 * MISHKAT — External Portal Discovery, Source Verification & Provenance Types
 * Phase 15.4-D
 */

export type PortalStatus =
  | 'DRAFT'
  | 'DISCOVERING'
  | 'ANALYZING'
  | 'TESTING'
  | 'VERIFIED'
  | 'UNSUPPORTED'
  | 'FAILED'
  | 'NEEDS_REVIEW'
  | 'BLOCKED';

export type IntegrationMethod =
  | 'OFFICIAL_API'
  | 'OAI_PMH'
  | 'OFFICIAL_SEARCH_ENDPOINT'
  | 'STRUCTURED_METADATA'
  | 'VERIFIED_WEB_SEARCH'
  | 'MANUAL_VERIFIED_CATALOG'
  | 'NONE';

export type VerificationStatus =
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'BLOCKED'
  | 'ERROR';

export type PortalHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export interface PortalCapabilities {
  searchSupported: boolean;
  recordLookupSupported: boolean;
  canonicalUrlsSupported: boolean;
  metadataSupported: boolean;
  fullTextSupported: boolean;
  verificationSupported: boolean;
}

export interface ImmutableProvenance {
  sourcePortalId: string;
  sourcePortalName: string;
  sourceBaseUrl: string;
  sourceRecordUrl: string;
  sourceRecordId: string;
  sourceRetrievedAt: string;
  sourceMethod: IntegrationMethod;
  verificationStatus: VerificationStatus;
}

export interface VerifiedPortalRecord extends ImmutableProvenance {
  id: string;
  portalId: string;
  title: string;
  author: string;
  categoryName?: string;
  categorySuggestion?: string;
  volumeInfo?: string;
  pagesCount: number;
  publishYear?: string;
  investigator?: string;
  summary: string;
  tags: string[];
  canonicalUrl: string;
  isDirectExtraction: boolean;
  sampleChapters?: {
    title: string;
    page: number;
    previewText: string;
  }[];
}

export interface PortalSearchOptions {
  categoryFilter?: string;
  limit?: number;
  offset?: number;
}

export interface VerificationResult {
  recordUrl: string;
  status: VerificationStatus;
  httpStatus?: number;
  isSoft404?: boolean;
  redirectChain?: string[];
  finalUrl?: string;
  contentMatched?: boolean;
  details?: string;
  verifiedAt: string;
}

export interface OnboardingTestCheck {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  details?: string;
  error?: string;
  durationMs: number;
}

export interface OnboardingTestReport {
  portalId: string;
  portalName: string;
  url: string;
  timestamp: string;
  allPassed: boolean;
  checks: OnboardingTestCheck[];
  suggestedStatus: PortalStatus;
  suggestedMethod: IntegrationMethod;
  capabilities: PortalCapabilities;
  failureReason?: string;
}

export interface PortalDiscoveryResult {
  reachable: boolean;
  httpStatus?: number;
  detectedMethod: IntegrationMethod;
  apiEndpoints?: string[];
  oaiPmhBaseUrl?: string;
  searchEndpoint?: string;
  hasStructuredMetadata: boolean;
  supportsHttps: boolean;
  robotsBlocked?: boolean;
  capabilities: PortalCapabilities;
  notes: string[];
}
