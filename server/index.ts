import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { serverConfig } from './config';
import { db } from './db/pool';
import { runMigrations } from './db/migrator';
import { seedInitialData } from './db/seed';

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
import portalsRoutes from './routes/portals.routes';
import notificationsRoutes from './routes/notifications.routes';
import submissionsRoutes from './routes/submissions.routes';
import settingsRoutes from './routes/settings.routes';
import { auditRouter, backupRouter, healthRouter, systemRouter, incomingRouter } from './routes/system.routes';
import { startIncomingWatcher, stopIncomingWatcher } from './services/incomingWatcher';
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

  // NOTE: Private digital files and covers are NOT served via express.static.
  // All digital file access goes through the authenticated GET /api/v1/books/:id/file
  // and /api/v1/books/files/* routes which enforce JWT authentication and path traversal protection.

  // Initialize DB Connection, Migrations, and Seed safely
  try {
    await db.connect();
    if (db.isPgConnected()) {
      await runMigrations();
      await seedInitialData();
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
  app.use('/api/v1/portals', portalsRoutes);
  app.use('/api/v1/notifications', notificationsRoutes);
  app.use('/api/v1/submissions', submissionsRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/audit-logs', auditRouter);
  app.use('/api/v1/backups', backupRouter);
  app.use('/api/v1/system', systemRouter);
  app.use('/api/v1/system', incomingRouter);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

export async function startServer() {
  const app = await createExpressApp();
  const PORT = serverConfig.port;

  // Mount Vite Middleware in Development
  if (process.env.NODE_ENV !== 'production') {
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Mishkat Library Central Server running on http://0.0.0.0:${PORT}`, {
      port: PORT,
      host: '0.0.0.0',
      dataDir: serverConfig.dirs.root,
      mode: process.env.NODE_ENV || 'development',
    });
    console.log(`\n======================================================`);
    console.log(`🚀 Mishkat Library Central Server running on http://0.0.0.0:${PORT}`);
    console.log(`📚 Central Data Directory: ${serverConfig.dirs.root}`);
    console.log(`✨ Mode: ${process.env.NODE_ENV || 'development'}`);
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
}
