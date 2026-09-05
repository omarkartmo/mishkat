import fs from 'fs';
import path from 'path';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { serverConfig } from '../config';

// Interface for Database abstraction
export interface IDatabase {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  transaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T>;
  isPgConnected(): boolean;
  close(): Promise<void>;
  connect(): Promise<void>;
}

export interface IDatabaseClient {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
}

export class DatabaseUnavailableError extends Error {
  public statusCode = 503;
  public code = 'DATABASE_UNAVAILABLE';
  public isCustomError = true;

  constructor(message = 'خادم قاعدة البيانات المركزية (PostgreSQL) غير متوفر حالياً. يرجى التأكد من تشغيل الخدمة والاتصال بالشبكة.') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

class PostgresDatabaseEngine implements IDatabase {
  private pgPool: Pool | null = null;
  private pgliteInstance: PGlite | null = null;
  private isConnected: boolean = false;
  private engineType: 'external_pg' | 'embedded_pg' | null = null;

  public async connect(): Promise<void> {
    const hasExternalUrl = Boolean(serverConfig.databaseUrl && serverConfig.databaseUrl.trim() !== '');

    if (hasExternalUrl) {
      try {
        this.pgPool = new Pool({
          connectionString: serverConfig.databaseUrl,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });

        this.pgPool.on('error', (err) => {
          console.error('⚠️ [PostgreSQL Pool Error]', err.message);
          this.isConnected = false;
        });

        const client = await this.pgPool.connect();
        client.release();

        this.isConnected = true;
        this.engineType = 'external_pg';
        console.log('✅ [Database] PostgreSQL External Central Server Connected Successfully.');
        return;
      } catch (err: any) {
        console.warn('⚠️ [Database] External PostgreSQL connection failed:', err.message);
        if (this.pgPool) {
          await this.pgPool.end().catch(() => {});
          this.pgPool = null;
        }
      }
    }

    // Helper to safely initialize and test embedded PGlite instance
    const initAndTestPgLite = async (dataDir: string): Promise<PGlite> => {
      // 1. Remove stale postmaster.pid lock file if leftover from previous crash/hard kill
      const pidFile = path.join(dataDir, 'postmaster.pid');
      if (fs.existsSync(pidFile)) {
        try {
          fs.unlinkSync(pidFile);
          console.log('🧹 [Database] Cleaned up stale postmaster.pid lock file.');
        } catch (e: any) {
          console.warn('⚠️ [Database] Could not remove stale postmaster.pid:', e.message);
        }
      }

      const instance = new PGlite(dataDir);
      try {
        // Run sanity test query to ensure WAL is healthy and not aborted
        await instance.query('SELECT 1');
        return instance;
      } catch (testErr) {
        await instance.close().catch(() => {});
        throw testErr;
      }
    };

    // Initialize embedded central PostgreSQL engine (PGlite)
    try {
      this.pgliteInstance = await initAndTestPgLite(serverConfig.dirs.pgdata);
      this.isConnected = true;
      this.engineType = 'embedded_pg';
      console.log(`✅ [Database] Embedded Central PostgreSQL Engine (PGlite) Connected. Storage: ${serverConfig.dirs.pgdata}`);
    } catch (pgliteErr: any) {
      console.warn('⚠️ [Database] Embedded PostgreSQL engine encountered corrupted storage or unrecoverable WAL:', pgliteErr.message);
      console.log('🔄 [Database] Attempting automatic self-healing recovery: backing up corrupted store and re-initializing clean database...');
      try {
        if (this.pgliteInstance) {
          await this.pgliteInstance.close().catch(() => {});
          this.pgliteInstance = null;
        }
        const corruptBackup = `${serverConfig.dirs.pgdata}_corrupt_${Date.now()}`;
        let activeDir = serverConfig.dirs.pgdata;
        if (fs.existsSync(serverConfig.dirs.pgdata)) {
          try {
            fs.renameSync(serverConfig.dirs.pgdata, corruptBackup);
            console.log(`📦 [Database] Preserved corrupted storage at: ${corruptBackup}`);
            fs.mkdirSync(serverConfig.dirs.pgdata, { recursive: true });
          } catch (renameErr: any) {
            console.warn(`⚠️ [Database] Could not rename locked storage directory (${renameErr.message}). Using fallback recovery directory.`);
            activeDir = `${serverConfig.dirs.pgdata}_recovered_${Date.now()}`;
            fs.mkdirSync(activeDir, { recursive: true });
          }
        } else {
          fs.mkdirSync(activeDir, { recursive: true });
        }

        this.pgliteInstance = await initAndTestPgLite(activeDir);
        this.isConnected = true;
        this.engineType = 'embedded_pg';
        console.log(`✅ [Database] Clean Embedded PostgreSQL Engine initialized successfully at: ${activeDir}`);
      } catch (recoveryErr: any) {
        this.isConnected = false;
        this.engineType = null;
        console.error('❌ [Database] Failed to recover embedded PostgreSQL engine:', recoveryErr.message);
        throw new DatabaseUnavailableError();
      }
    }
  }

  public isPgConnected(): boolean {
    return this.isConnected && (this.pgPool !== null || this.pgliteInstance !== null);
  }

  public async query<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (!this.isConnected || (!this.pgPool && !this.pgliteInstance)) {
      await this.connect();
    }

    if (this.engineType === 'external_pg' && this.pgPool) {
      try {
        const res: QueryResult<T> = await this.pgPool.query<T>(text, params);
        return { rows: res.rows, rowCount: res.rowCount ?? 0 };
      } catch (pgErr: any) {
        if (pgErr.code === 'ECONNREFUSED' || pgErr.code === '57P01' || pgErr.code === '08006' || pgErr.code === '08001') {
          this.isConnected = false;
          throw new DatabaseUnavailableError();
        }
        console.error('[PostgreSQL Query Error]', pgErr.message, '\nQuery:', text);
        throw pgErr;
      }
    }

    if (this.engineType === 'embedded_pg' && this.pgliteInstance) {
      try {
        const res = await this.pgliteInstance.query<T>(text, params);
        const rowCount = res.affectedRows !== undefined ? res.affectedRows : res.rows.length;
        return { rows: res.rows, rowCount };
      } catch (pgErr: any) {
        console.error('[Embedded PostgreSQL Query Error]', pgErr.message, '\nQuery:', text);
        throw pgErr;
      }
    }

    throw new DatabaseUnavailableError();
  }

  public async transaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    if (!this.isConnected || (!this.pgPool && !this.pgliteInstance)) {
      await this.connect();
    }

    if (this.engineType === 'external_pg' && this.pgPool) {
      const client: PoolClient = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        const dbClient: IDatabaseClient = {
          query: async (text, params) => {
            const res = await client.query(text, params);
            return { rows: res.rows, rowCount: res.rowCount ?? 0 };
          },
        };
        const result = await callback(dbClient);
        await client.query('COMMIT');
        return result;
      } catch (err: any) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error('[PostgreSQL Rollback Error]', rollbackErr);
        }
        throw err;
      } finally {
        client.release();
      }
    }

    if (this.engineType === 'embedded_pg' && this.pgliteInstance) {
      return this.pgliteInstance.transaction(async (tx) => {
        const dbClient: IDatabaseClient = {
          query: async (text, params) => {
            const res = await tx.query(text, params);
            const rowCount = res.affectedRows !== undefined ? res.affectedRows : res.rows.length;
            return { rows: res.rows as any, rowCount };
          },
        };
        return await callback(dbClient);
      });
    }

    throw new DatabaseUnavailableError();
  }

  public async close(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
    if (this.pgliteInstance) {
      await this.pgliteInstance.close();
      this.pgliteInstance = null;
    }
    this.isConnected = false;
    this.engineType = null;
  }
}

export const db = new PostgresDatabaseEngine();

