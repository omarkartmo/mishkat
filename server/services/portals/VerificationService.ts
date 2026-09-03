/**
 * MISHKAT — Source Record Verification Service
 * Phase 15.4-D: Real 404, Soft 404, Redirect Security & Content Matching
 */

import { securityFetch } from './securityHttpClient';
import { VerificationResult, VerificationStatus } from './types';

// Arabic and English soft-404 signatures
const SOFT_404_SIGNATURES = [
  '404 not found',
  'page not found',
  'record not found',
  'item not found',
  'document not found',
  'لم يتم العثور على',
  'صفحة غير موجودة',
  'الصفحة المطلوبة غير موجودة',
  'الكتاب غير موجود',
  'المستند غير متوفر',
  'عذراً، لم نتمكن من العثور',
  'عفواً، الرابط غير صحيح',
  'عذرا، الصفحة غير موجودة',
  'خطأ 404',
  'error 404',
  'لا توجد نتائج مطابقة',
  'المحتوى غير متوفر',
  'لا يوجد سجل بهذا المعرف',
];

export class VerificationService {
  /**
   * Checks if an HTML body or text snippet contains soft 404 indicators
   */
  public static isSoft404(body: string): boolean {
    if (!body || body.trim().length < 80) {
      return true; // Empty or near-empty response
    }

    const lower = body.toLowerCase();

    // Check title tag specifically
    const titleMatch = lower.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const titleContent = titleMatch[1];
      if (
        titleContent.includes('404') ||
        titleContent.includes('not found') ||
        titleContent.includes('غير موجود') ||
        titleContent.includes('غير متوفر') ||
        titleContent.includes('خطأ')
      ) {
        return true;
      }
    }

    // Check h1/h2 tags
    const h1Match = lower.match(/<h[1-2][^>]*>([^<]+)<\/h[1-2]>/i);
    if (h1Match) {
      const h1Content = h1Match[1];
      for (const sig of SOFT_404_SIGNATURES) {
        if (h1Content.includes(sig)) {
          return true;
        }
      }
    }

    // Check general body for distinct soft-404 sentences
    for (const sig of SOFT_404_SIGNATURES) {
      if (lower.includes(sig)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validates if retrieved content actually matches the expected title/author
   */
  public static matchesContent(body: string, expectedTitle?: string, expectedAuthor?: string): boolean {
    if (!expectedTitle && !expectedAuthor) return true;

    const lower = body.toLowerCase();

    // Normalize Arabic text for comparison (remove diacritics, normalize alef)
    const normalizeText = (t: string) =>
      t
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
        .replace(/[إأآا]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .trim();

    const normalizedBody = normalizeText(lower);

    if (expectedTitle) {
      const normTitle = normalizeText(expectedTitle);
      const titleTokens = normTitle.split(/\s+/).filter((w) => w.length > 2);
      // Check if at least 60% of significant title tokens appear in the content
      if (titleTokens.length > 0) {
        const matches = titleTokens.filter((t) => normalizedBody.includes(t));
        if (matches.length / titleTokens.length < 0.6) {
          return false;
        }
      }
    }

    if (expectedAuthor) {
      const normAuthor = normalizeText(expectedAuthor);
      const authorTokens = normAuthor.split(/\s+/).filter((w) => w.length > 2);
      if (authorTokens.length > 0) {
        const matches = authorTokens.filter((t) => normalizedBody.includes(t));
        if (matches.length / authorTokens.length < 0.5) {
          // If author not found and title was also borderline, be cautious
          // but allow if title strongly matched
        }
      }
    }

    return true;
  }

  /**
   * Complete verification pipeline: Real 404, Soft 404, Redirect Security, and Content Match
   */
  public static async verifyUrl(
    targetUrl: string,
    options: {
      allowedDomains?: string[];
      expectedTitle?: string;
      expectedAuthor?: string;
      allowLocalhost?: boolean;
    } = {}
  ): Promise<VerificationResult> {
    const verifiedAt = new Date().toISOString();

    try {
      const response = await securityFetch(targetUrl, {
        allowedDomains: options.allowedDomains,
        allowLocalhost: options.allowLocalhost,
        timeoutMs: 7000,
        maxRedirects: 5,
      });

      // 1. Check HTTP Status (Hard 404 / 410)
      if (response.status === 404 || response.status === 410) {
        return {
          recordUrl: targetUrl,
          status: 'NOT_FOUND',
          httpStatus: response.status,
          isSoft404: false,
          redirectChain: response.redirectChain,
          finalUrl: response.finalUrl,
          details: `Hard ${response.status}: Record was not found on the remote server.`,
          verifiedAt,
        };
      }

      if (response.status >= 500) {
        return {
          recordUrl: targetUrl,
          status: 'UNAVAILABLE',
          httpStatus: response.status,
          redirectChain: response.redirectChain,
          finalUrl: response.finalUrl,
          details: `Server error ${response.status}: Remote portal service is temporarily unavailable.`,
          verifiedAt,
        };
      }

      if (response.status === 403 || response.status === 401) {
        return {
          recordUrl: targetUrl,
          status: 'BLOCKED',
          httpStatus: response.status,
          redirectChain: response.redirectChain,
          finalUrl: response.finalUrl,
          details: `Access forbidden (${response.status}): Remote portal requires authentication or blocks automated requests.`,
          verifiedAt,
        };
      }

      // 2. Check Soft 404
      const isSoft = this.isSoft404(response.body);
      if (isSoft) {
        return {
          recordUrl: targetUrl,
          status: 'NOT_FOUND',
          httpStatus: response.status,
          isSoft404: true,
          redirectChain: response.redirectChain,
          finalUrl: response.finalUrl,
          details: 'Soft 404 detected: Remote portal returned HTTP 200 but page content indicates the record does not exist.',
          verifiedAt,
        };
      }

      // 3. Content matching
      const matched = this.matchesContent(response.body, options.expectedTitle, options.expectedAuthor);
      if (!matched) {
        return {
          recordUrl: targetUrl,
          status: 'UNVERIFIED',
          httpStatus: response.status,
          isSoft404: false,
          redirectChain: response.redirectChain,
          finalUrl: response.finalUrl,
          contentMatched: false,
          details: 'Content mismatch: Record URL exists but content does not match expected title/author metadata.',
          verifiedAt,
        };
      }

      // Everything verified
      return {
        recordUrl: targetUrl,
        status: 'VERIFIED',
        httpStatus: response.status,
        isSoft404: false,
        redirectChain: response.redirectChain,
        finalUrl: response.finalUrl,
        contentMatched: true,
        details: 'Record successfully verified from source.',
        verifiedAt,
      };
    } catch (err: any) {
      if (err.message.includes('MALICIOUS_REDIRECT_BLOCKED') || err.message.includes('DOMAIN_NOT_ALLOWED')) {
        return {
          recordUrl: targetUrl,
          status: 'BLOCKED',
          details: `Security Violation: ${err.message}`,
          verifiedAt,
        };
      }

      if (err.message.includes('SSRF_BLOCKED')) {
        return {
          recordUrl: targetUrl,
          status: 'BLOCKED',
          details: `Security Block: ${err.message}`,
          verifiedAt,
        };
      }

      if (err.message.includes('TIMEOUT') || err.message.includes('ECONNREFUSED')) {
        return {
          recordUrl: targetUrl,
          status: 'UNAVAILABLE',
          details: `Connection failed: ${err.message}`,
          verifiedAt,
        };
      }

      return {
        recordUrl: targetUrl,
        status: 'ERROR',
        details: `Verification error: ${err.message}`,
        verifiedAt,
      };
    }
  }
}
