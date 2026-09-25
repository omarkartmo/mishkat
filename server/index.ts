import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { serverConfig } from './config';
import { db } from './db/pool';
import { runMigrations } from './db/migrator';
import { seedInitialData } from './db/seed';
import { healCorruptedDigitalBooks, healDigitalBookPageCounts } from './services/bookSanitizer';

// Import Route Handlers
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import booksRoutes from './routes/books.routes';
import categoriesRoutes from './routes/categories.routes';
import loansRoutes from './routes/loans.routes';
import loanRequestsRoutes from './routes/loanRequests.routes';
import summariesRoutes from './routes/summaries.routes';
import notesRoutes from './routes/notes.routes';
import bookmarksRoutes from './routes/bookmarks.routes';
import readingProgressRoutes from './routes/readingProgress.routes';
import favoritesRoutes from './routes/favorites.routes';
import notificationsRoutes from './routes/notifications.routes';
import submissionsRoutes from './routes/submissions.routes';
import settingsRoutes from './routes/settings.routes';
import internetPolicyRoutes from './routes/internetPolicy.routes';
import { auditRouter, backupRouter, healthRouter, systemRouter, incomingRouter } from './routes/system.routes';
import { supportRouter, clientEventsRouter } from './routes/support.routes';
import { startIncomingWatcher, stopIncomingWatcher } from './services/incomingWatcher';
import { backupScheduler } from './services/backupScheduler';
import { googleDriveService } from './services/googleDriveService';
import { supportAgentService } from './services/supportAgentService';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// Helper to determine whether an origin is from a private LAN subnet
const isLanOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    // Localhost / Loopback
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    // Private IPv4 LAN Ranges (RFC 1918): 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (/^(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/.test(host)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

export async function createExpressApp() {
  const app = express();

  // Standard Security Headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    next();
  });

  // Secure LAN-Aware CORS Middleware
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. same-origin SPA requests, mobile apps, local tools)
      if (!origin) return callback(null, true);
      if (serverConfig.allowedCorsOrigins.includes(origin) || isLanOrigin(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Serve local CMap font tables for 100% offline, zero-latency local LAN PDF rendering
  const cmapsLocalPath = path.join(process.cwd(), 'public', 'cmaps');
  if (fs.existsSync(cmapsLocalPath)) {
    app.use('/cmaps', express.static(cmapsLocalPath, { maxAge: '30d', immutable: true }));
  }

  // Serve local Standard Fonts for 100% offline, zero-latency Arabic PDF rendering
  const standardFontsLocalPath = path.join(process.cwd(), 'public', 'standard_fonts');
  if (fs.existsSync(standardFontsLocalPath)) {
    app.use('/standard_fonts', express.static(standardFontsLocalPath, { maxAge: '30d', immutable: true }));
  }

  // NOTE: Private digital files and covers are NOT served via express.static.
  // All digital file access goes through the authenticated GET /api/v1/books/:id/file
  // and /api/v1/books/files/* routes which enforce JWT authentication and path traversal protection.

  // Initialize DB Connection, Migrations, and Seed safely
  try {
    await db.connect();
    if (db.isPgConnected()) {
      await runMigrations();
      await seedInitialData();
      await healCorruptedDigitalBooks(db);
      await healDigitalBookPageCounts(db);
      try {
        await googleDriveService.syncTokensWithDb();
      } catch (syncErr: any) {
        logger.warn(`[GoogleDrive] Token DB sync deferred: ${syncErr.message}`);
      }
    } else {
      console.log('ℹ️ [Database] Central Database is currently not connected. API will serve health checks and handle connection gracefully.');
    }
  } catch (dbInitErr: any) {
    console.warn('⚠️ [Database Init] Database initial setup deferred:', dbInitErr.message);
  }

  // Start incoming directory watcher (non-blocking, best-effort)
  try {
    startIncomingWatcher();
  } catch (watchErr: any) {
    logger.warn(`[IncomingWatcher] Could not start watcher: ${watchErr.message}`);
  }

  // Start automatic backup scheduler in non-test mode
  if (process.env.NODE_ENV !== 'test') {
    try {
      backupScheduler.start();
    } catch (schedErr: any) {
      logger.warn(`[BackupScheduler] Could not start scheduler: ${schedErr.message}`);
    }

    try {
      supportAgentService.startOutboundQueueWorker();
    } catch (suppErr: any) {
      logger.warn(`[SupportAgent] Could not start outbound worker: ${suppErr.message}`);
    }
  }

  // Mount API v1 Routes
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/books', booksRoutes);
  app.use('/api/v1/categories', categoriesRoutes);
  app.use('/api/v1/loans', loansRoutes);
  app.use('/api/v1/loan-requests', loanRequestsRoutes);
  app.use('/api/v1/summaries', summariesRoutes);
  app.use('/api/v1/notes', notesRoutes);
  app.use('/api/v1/bookmarks', bookmarksRoutes);
  app.use('/api/v1/reading-progress', readingProgressRoutes);
  app.use('/api/v1/favorites', favoritesRoutes);
  app.use('/api/v1/notifications', notificationsRoutes);
  app.use('/api/v1/submissions', submissionsRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/internet-policy', internetPolicyRoutes);
  app.use('/api/v1/audit-logs', auditRouter);
  app.use('/api/v1/backups', backupRouter);
  app.use('/api/v1/system', systemRouter);
  app.use('/api/v1/system', incomingRouter);
  app.use('/api/v1/client-events', clientEventsRouter);
  app.use('/api/v1/support', supportRouter);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

export async function startServer() {
  const app = await createExpressApp();
  const PORT = serverConfig.port;

  // Mount Vite Middleware in Development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: {
          ignored: [
            '**/LibraryData/**',
            '**/dist/**',
            '**/.git/**',
            '**/*.pdf',
            '**/*.epub',
          ],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    let lanIp = '127.0.0.1';
    try {
      const ifaces = os.networkInterfaces();
      for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name] || []) {
          if (iface.family === 'IPv4' && !iface.internal) {
            lanIp = iface.address;
            break;
          }
        }
      }
    } catch {}

    logger.info(`🚀 Mishkat Central Server running on http://localhost:${PORT}`, {
      port: PORT,
      host: '0.0.0.0',
      lanIp,
      dataDir: serverConfig.dirs.root,
      mode: process.env.NODE_ENV || 'development',
    });
    console.log(`\n======================================================`);
    console.log(`🚀 Mishkat Library Central Server Ready`);
    console.log(`💻 Local Computer:       http://localhost:${PORT}`);
    console.log(`📱 Phone / Local LAN:    http://${lanIp}:${PORT}`);
    console.log(`📚 Central Data Dir:     ${serverConfig.dirs.root}`);
    console.log(`✨ Mode:                 ${process.env.NODE_ENV || 'development'}`);
    console.log(`======================================================\n`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`[Server] Port ${PORT} is busy, address already in use.`, { port: PORT });
      console.warn(`[Server] Port ${PORT} was busy, waiting before retry...`);
    } else {
      logger.error(`[Server Error] ${err.message}`, { code: err.code });
      console.error('[Server Error]', err);
    }
  });

  // Graceful Process Termination Handler with safety timeout
  const shutdown = async (signal: string) => {
    logger.info(`[Server] Received ${signal}. Starting graceful shutdown...`, { signal });
    console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
    const forceExitTimeout = setTimeout(() => {
      logger.warn('[Server] Forceful shutdown triggered after timeout.');
      console.warn('[Server] Forceful shutdown triggered after timeout.');
      process.exit(0);
    }, 5000);
    forceExitTimeout.unref();

    server.close(async () => {
      logger.info('[Server] HTTP listener closed.');
      console.log('[Server] HTTP listener closed.');
      try {
        stopIncomingWatcher();
        await db.close();
        logger.info('[Database] Database pool and engine closed cleanly.');
        console.log('[Database] Database pool and engine closed cleanly.');
      } catch (err: any) {
        logger.error(`[Database Shutdown Error] ${err.message}`);
        console.error('[Database Shutdown Error]', err.message);
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGBREAK', () => shutdown('SIGBREAK'));

  // Automatic Backend Error Detection: Uncaught Exceptions
  process.on('uncaughtException', (err: any) => {
    logger.error(`[Uncaught Exception] ${err?.message}`, { stack: err?.stack });
    console.error('[Uncaught Exception]', err);
    try {
      supportAgentService.enqueueOutboundReport({
        sourceType: 'server',
        component: 'node_process',
        errorType: 'uncaught_exception',
        errorCode: err?.code || 'UNCAUGHT_EXCEPTION',
        severity: 'critical',
        message: err?.message || 'Uncaught process exception',
        stackTrace: err?.stack,
        diagnosticContext: { pid: process.pid, platform: process.platform },
      }).catch(() => {});
    } catch {}
  });

  // Automatic Backend Error Detection: Unhandled Promise Rejections
  process.on('unhandledRejection', (reason: any) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error(`[Unhandled Promise Rejection] ${message}`, { stack });
    console.error('[Unhandled Promise Rejection]', reason);
    try {
      supportAgentService.enqueueOutboundReport({
        sourceType: 'server',
        component: 'node_process',
        errorType: 'unhandled_rejection',
        errorCode: 'UNHANDLED_PROMISE_REJECTION',
        severity: 'critical',
        message: message || 'Unhandled promise rejection',
        stackTrace: stack,
        diagnosticContext: { pid: process.pid, platform: process.platform },
      }).catch(() => {});
    } catch {}
  });
}
