import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
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
  private isConnected: boolean = false;
  private connectionError: Error | null = null;

  public async connect(): Promise<void> {
    const dbUrl = serverConfig.databaseUrl && serverConfig.databaseUrl.trim() !== ''
      ? serverConfig.databaseUrl
      : 'postgresql://postgres:postgres@localhost:5432/mishkat_db';

    try {
      this.pgPool = new Pool({
        connectionString: dbUrl,
        max: 20, // Concurrency pool for 10-50 LAN workstations
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      this.pgPool.on('error', (err) => {
        console.error('⚠️ [PostgreSQL Pool Error]', err.message);
        this.isConnected = false;
        this.connectionError = err;
      });

      // Test connection with timeout
      const client = await this.pgPool.connect();
      client.release();

      this.isConnected = true;
      this.connectionError = null;
      console.log('✅ [Database] PostgreSQL Central Server Connected Successfully.');
    } catch (err: any) {
      this.isConnected = false;
      this.connectionError = err;
      console.error('❌ [Database] PostgreSQL connection failed:', err.message);
      console.error('⚠️ [Database Policy] STRICT ISOLATION ENFORCED: No JSON/local fallback is permitted. Queries will return 503.');
    }
  }

  public isPgConnected(): boolean {
    return this.isConnected && this.pgPool !== null;
  }

  public async query<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (!this.pgPool || !this.isConnected) {
      // Attempt reconnect if pool was down
      try {
        if (!this.pgPool) {
          await this.connect();
        } else {
          const testClient = await this.pgPool.connect();
          testClient.release();
          this.isConnected = true;
        }
      } catch (reconnectErr) {
        throw new DatabaseUnavailableError();
      }
    }

    if (!this.pgPool || !this.isConnected) {
      throw new DatabaseUnavailableError();
    }

    try {
      const res: QueryResult<T> = await this.pgPool.query<T>(text, params);
      return { rows: res.rows, rowCount: res.rowCount ?? 0 };
    } catch (pgErr: any) {
      // Check if it's a connection loss
      if (pgErr.code === 'ECONNREFUSED' || pgErr.code === '57P01' || pgErr.code === '08006' || pgErr.code === '08001') {
        this.isConnected = false;
        throw new DatabaseUnavailableError();
      }
      console.error('[PostgreSQL Query Error]', pgErr.message, '\nQuery:', text);
      throw pgErr;
    }
  }

  public async transaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    if (!this.pgPool || !this.isConnected) {
      throw new DatabaseUnavailableError();
    }

    let client: PoolClient;
    try {
      client = await this.pgPool.connect();
    } catch (connErr) {
      this.isConnected = false;
      throw new DatabaseUnavailableError();
    }

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

  public async close(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
      this.isConnected = false;
    }
  }
}

export const db = new PostgresDatabaseEngine();
