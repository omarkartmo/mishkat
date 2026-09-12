/**
 * MISHKAT — Hardened Security HTTP Client
 * Phase 15.4-D: SSRF Guard, Safe Redirect Follower, and Protocol Enforcement
 * Hardened against: DNS Rebinding, Decimal/Hex IP encodings, IPv6 mappings, and internal subnet traversal.
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import net from 'net';
import dns from 'dns';

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

/**
 * Checks if a given IP address is in a private, loopback, link-local, or reserved range (RFC 1918 / RFC 3927 / RFC 4291)
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.trim().toLowerCase();

  // IPv4 check
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8 (Private class A)
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (Private class B: 172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private class C)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link-local & AWS/GCP metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    // 224.0.0.0/4 (Multicast)
    if (parts[0] >= 224 && parts[0] <= 239) return true;
    // 240.0.0.0/4 (Reserved / Future use)
    if (parts[0] >= 240) return true;

    return false;
  }

  // IPv6 check
  if (net.isIPv6(clean)) {
    // Loopback and unspecified
    if (clean === '::1' || clean === '::' || clean === '0:0:0:0:0:0:0:1' || clean === '0:0:0:0:0:0:0:0') return true;

    // IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1)
    if (clean.includes('::ffff:') || clean.includes(':ffff:')) {
      const parts = clean.split(':');
      const lastPart = parts[parts.length - 1];
      if (net.isIPv4(lastPart)) {
        return isPrivateOrReservedIp(lastPart);
      }
      return true;
    }

    // Unique Local Addresses (fc00::/7 -> fc.. or fd..)
    if (clean.startsWith('fc') || clean.startsWith('fd')) return true;

    // Link-Local (fe80::/10 -> fe80.. to febf..)
    if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) return true;

    return false;
  }

  return false;
}

export function isPrivateOrReservedHost(hostname: string): boolean {
  const raw = hostname.toLowerCase().trim();
  // Strip IPv6 brackets if present (e.g. [::1])
  const host = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return true;
  }
  if (host === 'metadata.google.internal' || host === '169.254.169.254') {
    return true;
  }

  // Check if string is an IP address directly
  if (net.isIP(host)) {
    return isPrivateOrReservedIp(host);
  }

  // Check for decimal integer, hex, or octal encoded IPs (e.g., 2130706433, 0x7f000001, 017700000001)
  if (/^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) {
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
  const allowLocalhost = options.allowLocalhost ?? (process.env.NODE_ENV === 'test');
  const redirectChain: string[] = [];

  let currentUrlStr = targetUrl;
  let redirectsCount = 0;

  while (redirectsCount <= maxRedirects) {
    // Validate target URL against SSRF and allowed domains
    const parsed = validateSafeUrl(currentUrlStr, {
      allowedDomains: options.allowedDomains,
      allowLocalhost,
    });

    // 4. DNS Resolution & Rebinding Check: ensure domain does not resolve to a private internal IP
    if (!allowLocalhost && !net.isIP(parsed.hostname)) {
      try {
        const addresses = await dns.promises.lookup(parsed.hostname, { all: true });
        for (const addr of addresses) {
          if (isPrivateOrReservedIp(addr.address)) {
            throw new Error(`SSRF_BLOCKED: Host '${parsed.hostname}' resolves to private/internal IP address '${addr.address}'.`);
          }
        }
      } catch (dnsErr: any) {
        if (dnsErr.message && dnsErr.message.startsWith('SSRF_BLOCKED:')) {
          throw dnsErr;
        }
        // If DNS lookup fails (e.g., host unreachable), allow http client to fail naturally
      }
    }

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

  throw new Error(`MAX_REDIRECTS_EXCEEDED: Exceeded max allowed redirects of ${maxRedirects}.`);
}
