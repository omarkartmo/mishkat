import express from 'express';
import cors from 'cors';
import path from 'path';
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
import { auditRouter, backupRouter, healthRouter, systemRouter } from './routes/system.routes';
import { errorHandler } from './middleware/errorHandler';

export async function createExpressApp() {
  const app = express();

  // Basic Middlewares
  app.use(cors({
    origin: serverConfig.allowedCorsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // NOTE: Private digital files and covers are NOT served via express.static.
  // All digital file access goes through the authenticated GET /api/v1/books/:id/file
  // route which enforces JWT authentication and path traversal protection.


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
    console.log(`\n======================================================`);
    console.log(`🚀 Mishkat Library Central Server running on http://0.0.0.0:${PORT}`);
    console.log(`📚 Central Data Directory: ${serverConfig.dirs.root}`);
    console.log(`✨ Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`======================================================\n`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server] Port ${PORT} was busy, waiting before retry...`);
    } else {
      console.error('[Server Error]', err);
    }
  });
}
