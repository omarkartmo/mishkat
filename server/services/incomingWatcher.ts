/**
 * MISHKAT Incoming Directory Watcher Service (Phase 15.4-I)
 * =========================================================
 * Watches the `incoming/` directory for new PDF/EPUB files dropped by admins.
 * Security model:
 *   - Files are NEVER auto-imported. They are queued in staging_queue for admin review.
 *   - Stability check: file size must remain unchanged across two polls (DEBOUNCE_MS apart).
 *   - Duplicate detection: SHA-256 hash checked against both books.file_hash and staging_queue.file_hash.
 *   - Path traversal: only files directly in incoming/ are processed (no subdirectories).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { serverConfig } from '../config';
import { db } from '../db/pool';
import { logger } from '../utils/logger';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.epub']);
const DEBOUNCE_MS = 3000; // 3-second stability window
const STABILITY_POLLS = 2; // file size must match across this many polls

interface PendingFile {
  filePath: string;
  firstSeen: number;
  lastSize: number;
  pollCount: number;
  timer: ReturnType<typeof setTimeout>;
}

interface WatcherStatus {
  isActive: boolean;
  incomingDir: string;
  startedAt: string | null;
  pendingFiles: number;
  lastScanAt: string | null;
  lastScanResult: string | null;
}

const pendingFiles = new Map<string, PendingFile>();
let watcherInstance: fs.FSWatcher | null = null;
let watcherStatus: WatcherStatus = {
  isActive: false,
  incomingDir: serverConfig.dirs.incoming,
  startedAt: null,
  pendingFiles: 0,
  lastScanAt: null,
  lastScanResult: null,
};

// ---- SHA-256 hash computation ----
function computeFileHash(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ---- Check for duplicate in books table or staging_queue ----
async function isDuplicate(hash: string): Promise<{ isDup: boolean; reason: string | null }> {
  const bookRes = await db.query(
    'SELECT id, title FROM books WHERE file_hash = $1 LIMIT 1',
    [hash]
  );
  if (bookRes.rows.length > 0) {
    return { isDup: true, reason: `تكرار مع كتاب موجود في المكتبة: ${bookRes.rows[0].title}` };
  }

  const queueRes = await db.query(
    "SELECT id, original_filename FROM staging_queue WHERE file_hash = $1 AND status NOT IN ('REJECTED') LIMIT 1",
    [hash]
  );
  if (queueRes.rows.length > 0) {
    return { isDup: true, reason: `تكرار مع ملف قيد المراجعة: ${queueRes.rows[0].original_filename}` };
  }

  return { isDup: false, reason: null };
}

// ---- Extract basic metadata from filename ----
function extractMetaFromFilename(filename: string): { title: string; author: string } {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (base.includes(' - ')) {
    const parts = base.split(' - ');
    return { title: parts[0].trim(), author: parts.slice(1).join(' - ').trim() };
  }
  if (base.includes(' للشيخ ')) {
    const parts = base.split(' للشيخ ');
    return { title: parts[0].trim(), author: `الشيخ ${parts[1].trim()}` };
  }
  return { title: base, author: '' };
}

// ---- Queue stable file into staging_queue table ----
async function queueStableFile(filePath: string): Promise<void> {
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    logger.warn(`[IncomingWatcher] Ignoring non-PDF/EPUB file: ${filename}`);
    return;
  }

  try {
    // Move file from incoming/ to staging dir for safety
    const stagingDir = path.join(serverConfig.dirs.temp, 'staging');
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }

    const fileHash = computeFileHash(filePath);
    const fileStat = fs.statSync(filePath);
    const fileSizeMb = Number((fileStat.size / (1024 * 1024)).toFixed(2));

    const { isDup, reason } = await isDuplicate(fileHash);
    const format = ext === '.pdf' ? 'pdf' : 'epub';
    const meta = extractMetaFromFilename(filename);

    // Move to staging dir
    const stagedName = `staged-${Date.now()}-${filename}`;
    const stagedPath = path.join(stagingDir, stagedName);
    fs.renameSync(filePath, stagedPath);

    const id = `sq-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    await db.query(
      `INSERT INTO staging_queue
        (id, original_filename, staged_file_path, source, format, file_size_mb, file_hash,
         title, author, confidence, status, duplicate_reason)
       VALUES ($1, $2, $3, 'incoming_watcher', $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        filename,
        stagedPath,
        format,
        fileSizeMb,
        fileHash,
        meta.title || filename,
        meta.author || '',
        isDup ? 0 : 60,
        isDup ? 'DUPLICATE' : 'PENDING_REVIEW',
        reason,
      ]
    );

    if (isDup) {
      logger.warn(`[IncomingWatcher] Duplicate detected for ${filename}: ${reason}`);
    } else {
      logger.info(`[IncomingWatcher] Queued ${filename} → staging_queue id=${id} (${fileSizeMb} MB, ${fileHash.substring(0, 10)}…)`);
    }
  } catch (err: any) {
    logger.error(`[IncomingWatcher] Failed to queue ${filename}: ${err.message}`);
  }
}

// ---- Debounced file stability handler ----
function scheduleStabilityCheck(filePath: string): void {
  const existing = pendingFiles.get(filePath);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const checkStability = async () => {
    if (!fs.existsSync(filePath)) {
      pendingFiles.delete(filePath);
      watcherStatus.pendingFiles = pendingFiles.size;
      return;
    }

    const stat = fs.statSync(filePath);
    const currentSize = stat.size;
    const pending = pendingFiles.get(filePath);

    if (!pending) return;

    if (currentSize === pending.lastSize) {
      pending.pollCount++;
    } else {
      pending.lastSize = currentSize;
      pending.pollCount = 0;
    }

    if (pending.pollCount >= STABILITY_POLLS) {
      // File is stable — process it
      pendingFiles.delete(filePath);
      watcherStatus.pendingFiles = pendingFiles.size;
      await queueStableFile(filePath);
    } else {
      // Schedule another check
      pending.timer = setTimeout(checkStability, DEBOUNCE_MS);
      pendingFiles.set(filePath, pending);
      watcherStatus.pendingFiles = pendingFiles.size;
    }
  };

  const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  pendingFiles.set(filePath, {
    filePath,
    firstSeen: Date.now(),
    lastSize: stat ? stat.size : -1,
    pollCount: 0,
    timer: setTimeout(checkStability, DEBOUNCE_MS),
  });
  watcherStatus.pendingFiles = pendingFiles.size;
}

// ---- Public API ----

export function startIncomingWatcher(): void {
  const incomingDir = serverConfig.dirs.incoming;

  if (watcherInstance) {
    logger.warn('[IncomingWatcher] Already running, skipping start.');
    return;
  }

  try {
    watcherInstance = fs.watch(incomingDir, { persistent: false }, (eventType, filename) => {
      if (!filename) return;

      // Only process files directly in incoming/ — no subdirs
      const filePath = path.join(incomingDir, filename);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return;

      // Ignore non-PDF/EPUB
      const ext = path.extname(filename).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) return;

      logger.info(`[IncomingWatcher] Detected ${eventType} on: ${filename}`);
      scheduleStabilityCheck(filePath);
    });

    watcherInstance.on('error', (err) => {
      logger.error(`[IncomingWatcher] fs.watch error: ${err.message}`);
    });

    watcherStatus = {
      ...watcherStatus,
      isActive: true,
      startedAt: new Date().toISOString(),
    };

    logger.info(`[IncomingWatcher] ✅ Started watching: ${incomingDir}`);
  } catch (err: any) {
    logger.error(`[IncomingWatcher] Failed to start: ${err.message}`);
  }
}

export function stopIncomingWatcher(): void {
  if (watcherInstance) {
    watcherInstance.close();
    watcherInstance = null;
  }

  // Cancel all pending timers
  pendingFiles.forEach((pending) => clearTimeout(pending.timer));
  pendingFiles.clear();

  watcherStatus = {
    ...watcherStatus,
    isActive: false,
    pendingFiles: 0,
  };

  logger.info('[IncomingWatcher] 🛑 Stopped.');
}

export function getWatcherStatus(): WatcherStatus {
  return { ...watcherStatus, pendingFiles: pendingFiles.size };
}

/**
 * Manual scan of incoming/ directory — processes all existing files found there.
 * Used by POST /api/v1/system/incoming-scan for on-demand triggering by admins.
 */
export async function manualScanIncoming(): Promise<{ found: number; queued: number; skipped: number }> {
  const incomingDir = serverConfig.dirs.incoming;
  let found = 0;
  let queued = 0;
  let skipped = 0;

  const entries = fs.readdirSync(incomingDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;

    found++;
    const filePath = path.join(incomingDir, entry.name);

    try {
      const hash = computeFileHash(filePath);
      const { isDup } = await isDuplicate(hash);
      if (isDup) {
        // Still stage it as DUPLICATE so admin can see and clean up
        await queueStableFile(filePath);
        skipped++;
      } else {
        await queueStableFile(filePath);
        queued++;
      }
    } catch (err: any) {
      logger.error(`[IncomingWatcher] manualScan error on ${entry.name}: ${err.message}`);
      skipped++;
    }
  }

  const resultMsg = `فحص يدوي: وُجد ${found} ملف، وُضع في الطابور ${queued}، مُتجاهَل ${skipped}`;
  watcherStatus.lastScanAt = new Date().toISOString();
  watcherStatus.lastScanResult = resultMsg;

  logger.info(`[IncomingWatcher] Manual scan: found=${found} queued=${queued} skipped=${skipped}`);
  return { found, queued, skipped };
}
