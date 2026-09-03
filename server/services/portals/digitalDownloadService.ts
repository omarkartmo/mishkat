/**
 * MISHKAT — Secure Server-Side Digital Book Download & Validation Service
 * Phase 15.4-E: Server-Side Ingestion, SSRF Guard, File Validation & SHA-256 Integrity
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { serverConfig } from '../../config';
import { validateSafeUrl, isPrivateOrReservedHost } from './securityHttpClient';
import { VerificationService } from './VerificationService';

export interface DownloadValidationOptions {
  bookId: string;
  format?: 'pdf' | 'epub';
  maxSizeBytes?: number;
  allowedDomains?: string[];
  allowLocalhost?: boolean;
}

export interface ValidatedDownloadResult {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileSizeStr: string;
  fileHash: string;
  mimeType: string;
  downloadedAt: string;
}

export class DigitalDownloadService {
  /**
   * Securely downloads an external digital document, validates its contents,
   * hashes it, and stores it in the central server digital repository.
   */
  public static async downloadAndValidate(
    sourceUrl: string,
    options: DownloadValidationOptions
  ): Promise<ValidatedDownloadResult> {
    const maxSizeBytes = options.maxSizeBytes || 50 * 1024 * 1024; // 50MB default
    const format = options.format || 'pdf';
    const cleanBookId = options.bookId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${cleanBookId}.${format}`;
    const targetFilePath = path.join(serverConfig.dirs.digital, fileName);
    const tempFilePath = path.join(serverConfig.dirs.digital, `${cleanBookId}.tmp`);

    // Ensure digital directory exists
    if (!fs.existsSync(serverConfig.dirs.digital)) {
      fs.mkdirSync(serverConfig.dirs.digital, { recursive: true });
    }

    let currentUrlStr = sourceUrl;
    let redirectsCount = 0;
    const maxRedirects = 5;

    while (redirectsCount <= maxRedirects) {
      // 1. SSRF & Protocol Safety Check
      const parsed = validateSafeUrl(currentUrlStr, {
        allowedDomains: options.allowedDomains,
        allowLocalhost: options.allowLocalhost ?? (process.env.NODE_ENV === 'test'),
      });

      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const response = await new Promise<{
        statusCode: number;
        statusMessage: string;
        headers: http.IncomingHttpHeaders;
        stream: http.IncomingMessage;
      }>((resolve, reject) => {
        const req = client.request(
          parsed,
          {
            method: 'GET',
            headers: {
              'User-Agent': 'MishkatDigitalLibraryIngest/1.0 (Educational Server-Side Ingestion)',
              Accept: 'application/pdf, application/epub+zip, application/octet-stream, */*',
            },
            timeout: 15000,
          },
          (res) => {
            resolve({
              statusCode: res.statusCode || 500,
              statusMessage: res.statusMessage || '',
              headers: res.headers,
              stream: res,
            });
          }
        );

        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`DOWNLOAD_TIMEOUT: Request to ${parsed.hostname} timed out.`));
        });

        req.on('error', (err) => reject(err));
        req.end();
      });

      // 2. Handle HTTP Redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        redirectsCount++;
        if (redirectsCount > maxRedirects) {
          throw new Error(`MAX_REDIRECTS_EXCEEDED: Exceeded ${maxRedirects} redirects.`);
        }

        const redirectTarget = new URL(response.headers.location, parsed.href).href;
        const targetParsed = new URL(redirectTarget);

        // Security check on redirect destination
        if (options.allowedDomains && options.allowedDomains.length > 0) {
          const isTargetAllowed = options.allowedDomains.some((d) => {
            const cleanDomain = d.toLowerCase().replace(/:\d+$/, '');
            const targetHost = targetParsed.hostname.toLowerCase();
            return targetHost === cleanDomain || targetHost.endsWith(`.${cleanDomain}`);
          });

          if (!isTargetAllowed) {
            throw new Error(
              `MALICIOUS_REDIRECT_BLOCKED: Redirect from '${parsed.hostname}' to unauthorized domain '${targetParsed.hostname}' was blocked.`
            );
          }
        } else {
          // If no specific domain whitelist is provided, must stay on same origin
          const originHost = parsed.hostname.toLowerCase();
          const targetHost = targetParsed.hostname.toLowerCase();
          if (targetHost !== originHost && !targetHost.endsWith(`.${originHost}`)) {
            throw new Error(
              `MALICIOUS_REDIRECT_BLOCKED: Redirect from '${originHost}' to external domain '${targetHost}' was blocked.`
            );
          }
        }

        currentUrlStr = redirectTarget;
        continue;
      }

      // 3. Status code check
      if (response.statusCode === 404 || response.statusCode === 410) {
        throw new Error(`FILE_NOT_FOUND: Remote server returned HTTP ${response.statusCode}. The file does not exist.`);
      }

      if (response.statusCode >= 400) {
        throw new Error(`HTTP_ERROR_${response.statusCode}: Remote server returned error ${response.statusCode}.`);
      }

      // 4. Content-Type Check
      const contentType = (response.headers['content-type'] || '').toLowerCase();
      if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
        throw new Error(`INVALID_CONTENT_TYPE: Remote URL returned HTML webpage instead of digital file (${contentType}).`);
      }

      // 5. Stream to temporary file with Size & Hash calculation
      const hash = crypto.createHash('sha256');
      const fileWriteStream = fs.createWriteStream(tempFilePath);
      let totalBytes = 0;
      let initialBuffer = Buffer.alloc(0);

      try {
        await new Promise<void>((resolve, reject) => {
          response.stream.on('data', (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > maxSizeBytes) {
              response.stream.destroy();
              reject(new Error(`FILE_TOO_LARGE: Download exceeded max limit of ${Math.round(maxSizeBytes / (1024 * 1024))}MB.`));
              return;
            }

            if (initialBuffer.length < 512) {
              initialBuffer = Buffer.concat([initialBuffer, chunk]);
            }

            hash.update(chunk);
            fileWriteStream.write(chunk);
          });

          response.stream.on('end', () => {
            fileWriteStream.end();
            resolve();
          });

          response.stream.on('error', (err) => {
            fileWriteStream.end();
            reject(err);
          });
        });
      } catch (streamErr: any) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        throw streamErr;
      }

      // 6. Content Sniffing: Verify Magic Bytes / Non-HTML
      const initialSnippet = initialBuffer.toString('utf8', 0, Math.min(initialBuffer.length, 512)).toLowerCase();
      if (
        initialSnippet.includes('<!doctype html') ||
        initialSnippet.includes('<html') ||
        VerificationService.isSoft404(initialSnippet)
      ) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        throw new Error('INVALID_FILE_BODY: File payload appears to be an HTML error page or soft-404.');
      }

      // 7. Verify minimum reasonable size for PDF/EPUB
      if (totalBytes < 500) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        throw new Error('CORRUPT_OR_EMPTY_FILE: Downloaded file is too small to be a valid digital book.');
      }

      // 8. Move temp file to final destination
      if (fs.existsSync(targetFilePath)) {
        fs.unlinkSync(targetFilePath);
      }
      fs.renameSync(tempFilePath, targetFilePath);

      const fileHash = hash.digest('hex');
      const fileSizeStr =
        totalBytes >= 1024 * 1024
          ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
          : `${(totalBytes / 1024).toFixed(0)} KB`;

      return {
        filePath: targetFilePath,
        fileName,
        fileSizeBytes: totalBytes,
        fileSizeStr,
        fileHash,
        mimeType: format === 'epub' ? 'application/epub+zip' : 'application/pdf',
        downloadedAt: new Date().toISOString(),
      };
    }

    throw new Error(`DOWNLOAD_FAILED: Could not download digital book from ${sourceUrl}.`);
  }
}
