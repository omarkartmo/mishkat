/**
 * MISHKAT — Central Path Safety & Integrity Utilities
 * Defends against Path Traversal (CWE-22, CWE-23), Arbitrary File Ingestion, and Memory Exhaustion (OOM).
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Checks if targetPath is strictly inside parentDir (prevents directory traversal attacks)
 */
export function isWithinDirectory(targetPath: string, parentDir: string): boolean {
  if (!targetPath || !parentDir) return false;
  const resolvedTarget = path.resolve(targetPath);
  const resolvedParent = path.resolve(parentDir);
  const relative = path.relative(resolvedParent.toLowerCase(), resolvedTarget.toLowerCase());
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Checks if a directory or file path points to dangerous operating system system-critical folders or drive roots
 */
export function isSystemDangerousPath(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') return true;
  const trimmed = targetPath.trim();
  if (!trimmed) return true;

  // Reject explicit path traversal sequences
  if (trimmed.includes('..') || trimmed.includes('\0')) return true;

  const resolved = path.resolve(trimmed).toLowerCase();
  const parsed = path.parse(resolved);
  const root = parsed.root.toLowerCase();

  // Forbid mounting the entire filesystem root (e.g. C:\ or /)
  if (resolved === root || resolved === path.normalize(root) || resolved === path.normalize(root).replace(/[\\/]$/, '')) {
    return true;
  }

  // Dangerous Windows and Unix system directories
  const dangerousPrefixes = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    'c:\\recovery',
    'c:\\$recycle.bin',
    'c:\\system volume information',
    '/etc',
    '/proc',
    '/sys',
    '/root',
    '/bin',
    '/sbin',
    '/usr',
    '/var/run',
    '/dev',
  ];
  // Check unix-style paths regardless of host OS platform
  const forwardPath = trimmed.toLowerCase().replace(/\\/g, '/');
  if (forwardPath === '/' || forwardPath === '') return true;

  const unixDangerousPrefixes = [
    '/etc',
    '/proc',
    '/sys',
    '/root',
    '/bin',
    '/sbin',
    '/usr',
    '/var/run',
    '/dev',
  ];
  if (unixDangerousPrefixes.some((p) => forwardPath === p || forwardPath.startsWith(p + '/'))) {
    return true;
  }

  return dangerousPrefixes.some((prefix) => resolved === prefix || resolved.startsWith(prefix + path.sep));
}

/**
 * Verifies file magic bytes (file signature) match the claimed extension.
 * Protects against disguised malicious executables or polyglots.
 */
export function verifyFileMagicBytes(filePath: string, ext: string): boolean {
  if (!filePath || !fs.existsSync(filePath)) return false;

  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);

    if (bytesRead < 4) return false;

    const cleanExt = ext.toLowerCase().replace(/^\./, '').trim();

    if (cleanExt === 'pdf') {
      // PDF files must start with %PDF- (0x25 0x50 0x44 0x46 0x2D)
      return buf.subarray(0, 5).toString('ascii').startsWith('%PDF-');
    }

    if (cleanExt === 'epub') {
      // EPUB files are ZIP archives starting with PK\x03\x04 (0x50 0x4B 0x03 0x04)
      return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
    }

    if (cleanExt === 'jpg' || cleanExt === 'jpeg') {
      // JPEG files start with FF D8 FF
      return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    }

    if (cleanExt === 'png') {
      // PNG files start with \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    }

    if (cleanExt === 'webp') {
      // WEBP starts with 'RIFF' .... 'WEBP'
      return (
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }

    // If extension is not in strict magic-bytes list, default to reject for security
    return false;
  } catch {
    return false;
  }
}

/**
 * Streams file through SHA-256 calculation to avoid memory exhaustion (OOM) on large files
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}
