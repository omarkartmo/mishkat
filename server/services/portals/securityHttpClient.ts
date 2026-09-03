/**
 * MISHKAT — Hardened Security HTTP Client
 * Phase 15.4-D: SSRF Guard, Safe Redirect Follower, and Protocol Enforcement
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface SecurityFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRedirects?: number;
  allowedDomains?: string[];
  allowLocalhost?: boolean; // Only true in explicit local test environments
  maxBodySizeBytes?: number;
}

export interface SecurityFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  finalUrl: string;
  redirectChain: string[];
}

// IP regexes for SSRF blocking
const PRIVATE_IP_REGEXES = [
  /^127\./,                         // Loopback
  /^10\./,                          // Private class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private class B
  /^192\.168\./,                    // Private class C
  /^169\.254\./,                    // Link-local / Cloud metadata
  /^0\./,                           // Current network
  /^::1$/,                          // IPv6 loopback
  /^fc00:/i,                        // IPv6 unique local
  /^fe80:/i,                        // IPv6 link-local
];

export function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return true;
  }
  if (host === 'metadata.google.internal' || host === '169.254.169.254') {
    return true;
  }
  for (const regex of PRIVATE_IP_REGEXES) {
    if (regex.test(host)) {
      return true;
    }
  }
  return false;
}

export function validateSafeUrl(urlStr: string, options: { allowedDomains?: string[]; allowLocalhost?: boolean } = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch (err: any) {
    throw new Error(`INVALID_URL: ${urlStr} is not a valid URL.`);
  }

  // 1. Protocol check: only https or http (http only if allowLocalhost or explicit dev)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`DISALLOWED_PROTOCOL: Protocol ${parsed.protocol} is forbidden. Only HTTPS is allowed.`);
  }

  if (parsed.protocol === 'http:' && !options.allowLocalhost) {
    // In production, require HTTPS for external portals
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`HTTPS_REQUIRED: External portals must use secure HTTPS in production.`);
    }
  }

  // 2. SSRF check on hostname
  const hostname = parsed.hostname;
  const isPrivate = isPrivateOrReservedHost(hostname);
  if (isPrivate && !options.allowLocalhost) {
    throw new Error(`SSRF_BLOCKED: Access to private or internal network address '${hostname}' is prohibited.`);
  }

  // 3. Allowed domains check (if specified)
  if (options.allowedDomains && options.allowedDomains.length > 0) {
    const isDomainAllowed = options.allowedDomains.some((d) => {
      const cleanDomain = d.toLowerCase().replace(/:\d+$/, '');
      const currentHost = hostname.toLowerCase();
      return currentHost === cleanDomain || currentHost.endsWith(`.${cleanDomain}`);
    });

    if (!isDomainAllowed) {
      throw new Error(`DOMAIN_NOT_ALLOWED: Target host '${hostname}' is not in approved allowed domains list.`);
    }
  }

  return parsed;
}

export async function securityFetch(
  targetUrl: string,
  options: SecurityFetchOptions = {}
): Promise<SecurityFetchResponse> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBodySizeBytes = options.maxBodySizeBytes ?? 5 * 1024 * 1024; // 5MB
  const redirectChain: string[] = [];

  let currentUrlStr = targetUrl;
  let redirectsCount = 0;

  while (redirectsCount <= maxRedirects) {
    // Validate target URL against SSRF and allowed domains
    const parsed = validateSafeUrl(currentUrlStr, {
      allowedDomains: options.allowedDomains,
      allowLocalhost: options.allowLocalhost ?? (process.env.NODE_ENV === 'test'),
    });

    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const res = await new Promise<{
      statusCode: number;
      statusMessage: string;
      headers: http.IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const req = client.request(
        parsed,
        {
          method: options.method || 'GET',
          headers: {
            'User-Agent': 'MishkatAcademicBot/1.0 (Educational Digital Library; source-verification)',
            Accept: 'application/json, application/xml, text/xml, text/html, */*',
            ...options.headers,
          },
          timeout: timeoutMs,
        },
        (response) => {
          let data = '';
          let totalBytes = 0;

          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            totalBytes += Buffer.byteLength(chunk);
            if (totalBytes > maxBodySizeBytes) {
              response.destroy();
              reject(new Error(`RESPONSE_TOO_LARGE: Exceeded max allowed size of ${maxBodySizeBytes} bytes.`));
              return;
            }
            data += chunk;
          });

          response.on('end', () => {
            resolve({
              statusCode: response.statusCode || 500,
              statusMessage: response.statusMessage || '',
              headers: response.headers,
              body: data,
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`TIMEOUT: Request to ${parsed.hostname} timed out after ${timeoutMs}ms.`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });

    // Check for redirect: 301, 302, 303, 307, 308
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      redirectsCount++;
      if (redirectsCount > maxRedirects) {
        throw new Error(`MAX_REDIRECTS_EXCEEDED: Followed ${maxRedirects} redirects, stopping.`);
      }

      const redirectTarget = new URL(res.headers.location, parsed.href).href;
      redirectChain.push(redirectTarget);

      // Verify redirect target domain is allowed
      const targetParsed = new URL(redirectTarget);
      if (options.allowedDomains && options.allowedDomains.length > 0) {
        const isTargetAllowed = options.allowedDomains.some((d) => {
          const cleanDomain = d.toLowerCase().replace(/:\d+$/, '');
          const targetHost = targetParsed.hostname.toLowerCase();
          return targetHost === cleanDomain || targetHost.endsWith(`.${cleanDomain}`);
        });

        if (!isTargetAllowed) {
          throw new Error(
            `MALICIOUS_REDIRECT_BLOCKED: Redirected from '${parsed.hostname}' to unauthorized external domain '${targetParsed.hostname}'.`
          );
        }
      } else {
        // If allowedDomains not provided, strictly restrict redirect to origin hostname
        const originHost = parsed.hostname.toLowerCase();
        const targetHost = targetParsed.hostname.toLowerCase();
        if (targetHost !== originHost && !targetHost.endsWith(`.${originHost}`)) {
          throw new Error(
            `MALICIOUS_REDIRECT_BLOCKED: Redirected from '${originHost}' to unauthorized external domain '${targetHost}'.`
          );
        }
      }

      currentUrlStr = redirectTarget;
      continue;
    }

    // Convert headers to Record<string, string>
    const normalizedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) {
      if (v) normalizedHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
    }

    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      statusText: res.statusMessage,
      headers: normalizedHeaders,
      body: res.body,
      finalUrl: parsed.href,
      redirectChain,
    };
  }

  throw new Error(`REQUEST_FAILED: Could not complete request to ${targetUrl}.`);
}
