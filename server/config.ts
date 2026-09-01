import path from 'path';
import fs from 'fs';

// Root data directory outside source code
const ROOT_DATA_DIR = process.env.DATA_DIRECTORY || path.join(process.cwd(), 'LibraryData');

// Ensure storage directories exist (Central Server File Storage only)
const DIRS = {
  root: ROOT_DATA_DIR,
  books: path.join(ROOT_DATA_DIR, 'books'),
  digital: path.join(ROOT_DATA_DIR, 'books', 'digital'),
  covers: path.join(ROOT_DATA_DIR, 'books', 'covers'),
  attachments: path.join(ROOT_DATA_DIR, 'books', 'attachments'),
  backups: path.join(ROOT_DATA_DIR, 'backups'),
  logs: path.join(ROOT_DATA_DIR, 'logs'),
  temp: path.join(ROOT_DATA_DIR, 'temp'),
  pgdata: path.join(ROOT_DATA_DIR, 'pgdata'),
};

// Create storage directories if they do not exist
Object.values(DIRS).forEach((dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

const isProduction = process.env.NODE_ENV === 'production';
const envJwtSecret = process.env.JWT_SECRET;

if (isProduction && (!envJwtSecret || envJwtSecret.trim() === '')) {
  console.error('FATAL: JWT_SECRET environment variable is missing in production environment. Server startup aborted.');
  process.exit(1);
}

export const serverConfig = {
  port: 3000,
  host: '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: envJwtSecret || (isProduction ? '' : 'mishkat-dev-jwt-secret-key-lan-only-2026'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL || '',
  dirs: DIRS,
  allowedCorsOrigins: process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',') 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10),
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  rateLimitMaxRequests: 300, // per window
  authRateLimitMax: 15, // max login attempts per window
};
