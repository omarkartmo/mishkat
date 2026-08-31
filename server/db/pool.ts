import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import fs from 'fs';
import path from 'path';
import { serverConfig } from '../config';

// Interface for Database abstraction
export interface IDatabase {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  transaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T>;
  isPgConnected(): boolean;
  close(): Promise<void>;
}

export interface IDatabaseClient {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
}

class RelationalDatabaseEngine implements IDatabase {
  private pgPool: Pool | null = null;
  private isUsingPg: boolean = false;
  private localStorePath: string;
  private localData: Record<string, any[]> = {};
  private lock: boolean = false;

  constructor() {
    this.localStorePath = path.join(serverConfig.dirs.db, 'mishkat_relational_store.json');
    this.initLocalStore();
  }

  private initLocalStore() {
    try {
      if (fs.existsSync(this.localStorePath)) {
        const raw = fs.readFileSync(this.localStorePath, 'utf8');
        this.localData = JSON.parse(raw);
      } else {
        this.localData = {
          schema_migrations: [],
          roles: [],
          permissions: [],
          role_permissions: [],
          users: [],
          categories: [],
          books: [],
          physical_copies: [],
          loans: [],
          loan_requests: [],
          reading_progress: [],
          physical_bookmarks: [],
          book_summaries: [],
          student_notes: [],
          student_favorites: [],
          pending_submissions: [],
          whitelisted_portals: [],
          notifications: [],
          system_settings: [],
          audit_logs: [],
        };
        this.saveLocalStore();
      }
    } catch (e) {
      console.error('[DB Engine] Error initializing local relational store:', e);
      this.localData = {};
    }
  }

  private saveLocalStore() {
    try {
      fs.writeFileSync(this.localStorePath, JSON.stringify(this.localData, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB Engine] Error saving local relational store:', e);
    }
  }

  public async connect(): Promise<void> {
    if (serverConfig.databaseUrl && serverConfig.databaseUrl.trim() !== '') {
      try {
        const pool = new Pool({
          connectionString: serverConfig.databaseUrl,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 3000,
        });

        // Add error handler to pool instance so it doesn't emit unhandled errors
        pool.on('error', (err) => {
          console.warn('[PostgreSQL Pool Background Warning]', err.message);
        });

        // Test connection with timeout
        const client = await pool.connect();
        client.release();
        this.pgPool = pool;
        this.isUsingPg = true;
        console.log('✅ [Database] Successfully connected to Central PostgreSQL Server at:', serverConfig.databaseUrl.split('@')[1] || 'PostgreSQL');
        return;
      } catch (err: any) {
        console.log('ℹ️ [Database] PostgreSQL not available (' + err.message + '). Operating on Central Relational Engine at: ' + this.localStorePath);
        if (this.pgPool) {
          try { await this.pgPool.end(); } catch (_) {}
        }
        this.pgPool = null;
        this.isUsingPg = false;
      }
    } else {
      console.log('ℹ️ [Database] Central Relational Store active at:', this.localStorePath);
      this.isUsingPg = false;
    }
  }

  public isPgConnected(): boolean {
    return this.isUsingPg;
  }

  public async query<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (this.isUsingPg && this.pgPool) {
      try {
        const res: QueryResult<T> = await this.pgPool.query<T>(text, params);
        return { rows: res.rows, rowCount: res.rowCount || 0 };
      } catch (pgErr) {
        console.error('[PostgreSQL Query Error]', pgErr, 'SQL:', text);
        throw pgErr;
      }
    }

    // Embedded Central Engine
    return this.executeLocalQuery<T>(text, params);
  }

  public async transaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    if (this.isUsingPg && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        const dbClient: IDatabaseClient = {
          query: async (text, params) => {
            const res = await client.query(text, params);
            return { rows: res.rows, rowCount: res.rowCount || 0 };
          },
        };
        const result = await callback(dbClient);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Local transaction simulation with atomic snapshot rollback
    const snapshot = JSON.stringify(this.localData);
    try {
      const dbClient: IDatabaseClient = {
        query: async (text, params) => this.executeLocalQuery(text, params),
      };
      const result = await callback(dbClient);
      this.saveLocalStore();
      return result;
    } catch (err) {
      this.localData = JSON.parse(snapshot);
      this.saveLocalStore();
      throw err;
    }
  }

  public async close(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
    }
    this.saveLocalStore();
  }

  // --- Local SQL / Relational Engine Parser & Executor ---
  private executeLocalQuery<T = any>(sql: string, params: any[] = []): { rows: T[]; rowCount: number } {
    const cleanSql = sql.trim().replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//gm, '').trim();
    const upper = cleanSql.toUpperCase();

    // Table names in our schema
    const tableMatch = cleanSql.match(/(?:FROM|INTO|UPDATE|TABLE\s+IF\s+NOT\s+EXISTS|TABLE)\s+([a-zA-Z0-9_]+)/i);
    const tableName = tableMatch ? tableMatch[1].toLowerCase() : '';

    if (upper.startsWith('CREATE TABLE')) {
      if (tableName && !this.localData[tableName]) {
        this.localData[tableName] = [];
        this.saveLocalStore();
      }
      return { rows: [], rowCount: 0 };
    }

    if (upper.startsWith('CREATE INDEX')) {
      return { rows: [], rowCount: 0 };
    }

    if (upper.startsWith('SELECT')) {
      return this.handleLocalSelect<T>(cleanSql, params);
    }

    if (upper.startsWith('INSERT')) {
      return this.handleLocalInsert<T>(cleanSql, params);
    }

    if (upper.startsWith('UPDATE')) {
      return this.handleLocalUpdate<T>(cleanSql, params);
    }

    if (upper.startsWith('DELETE')) {
      return this.handleLocalDelete<T>(cleanSql, params);
    }

    return { rows: [], rowCount: 0 };
  }

  private handleLocalSelect<T>(sql: string, params: any[]): { rows: T[]; rowCount: number } {
    const match = sql.match(/FROM\s+([a-zA-Z0-9_]+)(?:\s+(?:WHERE|ORDER|LIMIT|GROUP|JOIN|$))/i);
    if (!match) {
      return { rows: [], rowCount: 0 };
    }
    const tableName = match[1].toLowerCase();
    let rows = (this.localData[tableName] || []).map(r => ({ ...r }));

    // Basic WHERE evaluation
    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER|\s+LIMIT|\s+GROUP|$)/i);
    if (whereMatch) {
      const whereClause = whereMatch[1];
      rows = rows.filter((row) => this.evalWhere(row, whereClause, params));
    }

    // ORDER BY
    const orderMatch = sql.match(/ORDER\s+BY\s+([a-zA-Z0-9_]+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const field = orderMatch[1];
      const desc = orderMatch[2]?.toUpperCase() === 'DESC';
      rows.sort((a, b) => {
        const valA = a[field] ?? '';
        const valB = b[field] ?? '';
        if (valA < valB) return desc ? 1 : -1;
        if (valA > valB) return desc ? -1 : 1;
        return 0;
      });
    }

    // LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+|\$\d+)/i);
    if (limitMatch) {
      const limitVal = limitMatch[1].startsWith('$')
        ? parseInt(params[parseInt(limitMatch[1].slice(1), 10) - 1], 10)
        : parseInt(limitMatch[1], 10);
      if (!isNaN(limitVal)) {
        rows = rows.slice(0, limitVal);
      }
    }

    return { rows: rows as unknown as T[], rowCount: rows.length };
  }

  private handleLocalInsert<T>(sql: string, params: any[]): { rows: T[]; rowCount: number } {
    const tableMatch = sql.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!tableMatch) {
      return { rows: [], rowCount: 0 };
    }
    const tableName = tableMatch[1].toLowerCase();
    const columns = tableMatch[2].split(',').map(c => c.trim().toLowerCase());
    const valPlaceholders = tableMatch[3].split(',').map(v => v.trim());

    if (!this.localData[tableName]) {
      this.localData[tableName] = [];
    }

    const newRecord: Record<string, any> = {};
    columns.forEach((col, idx) => {
      const ph = valPlaceholders[idx];
      if (ph && ph.startsWith('$')) {
        const pIndex = parseInt(ph.slice(1), 10) - 1;
        newRecord[col] = params[pIndex] !== undefined ? params[pIndex] : null;
      } else if (ph) {
        newRecord[col] = ph.replace(/^['"]|['"]$/g, '');
      }
    });

    if (!newRecord.created_at) {
      newRecord.created_at = new Date().toISOString();
    }
    if (!newRecord.updated_at) {
      newRecord.updated_at = new Date().toISOString();
    }

    // Check unique key or conflict
    const primaryKey = 'id';
    if (newRecord[primaryKey]) {
      const existingIdx = this.localData[tableName].findIndex(r => r[primaryKey] === newRecord[primaryKey]);
      if (existingIdx >= 0) {
        if (/ON\s+CONFLICT/i.test(sql)) {
          this.localData[tableName][existingIdx] = { ...this.localData[tableName][existingIdx], ...newRecord };
          this.saveLocalStore();
          return { rows: [this.localData[tableName][existingIdx]] as unknown as T[], rowCount: 1 };
        } else {
          // Replace or error
          this.localData[tableName][existingIdx] = newRecord;
          this.saveLocalStore();
          return { rows: [newRecord] as unknown as T[], rowCount: 1 };
        }
      }
    }

    this.localData[tableName].push(newRecord);
    this.saveLocalStore();
    return { rows: [newRecord] as unknown as T[], rowCount: 1 };
  }

  private handleLocalUpdate<T>(sql: string, params: any[]): { rows: T[]; rowCount: number } {
    const tableMatch = sql.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+([\s\S]+?)(?:\s+WHERE|$)/i);
    if (!tableMatch) {
      return { rows: [], rowCount: 0 };
    }
    const tableName = tableMatch[1].toLowerCase();
    const setClause = tableMatch[2];
    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)$/i);

    if (!this.localData[tableName]) {
      return { rows: [], rowCount: 0 };
    }

    // Parse SET statements
    const setPairs = setClause.split(',').map(s => s.trim());
    const updates: Record<string, any> = {};

    setPairs.forEach(pair => {
      const [col, val] = pair.split('=').map(p => p.trim());
      if (col && val) {
        const colName = col.toLowerCase();
        if (val.startsWith('$')) {
          const pIndex = parseInt(val.slice(1), 10) - 1;
          updates[colName] = params[pIndex];
        } else {
          updates[colName] = val.replace(/^['"]|['"]$/g, '');
        }
      }
    });

    let updatedCount = 0;
    const updatedRows: any[] = [];

    this.localData[tableName] = this.localData[tableName].map(row => {
      let matches = true;
      if (whereMatch) {
        matches = this.evalWhere(row, whereMatch[1], params);
      }
      if (matches) {
        const newRow = { ...row, ...updates, updated_at: new Date().toISOString() };
        updatedCount++;
        updatedRows.push(newRow);
        return newRow;
      }
      return row;
    });

    this.saveLocalStore();
    return { rows: updatedRows as unknown as T[], rowCount: updatedCount };
  }

  private handleLocalDelete<T>(sql: string, params: any[]): { rows: T[]; rowCount: number } {
    const tableMatch = sql.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE|$)/i);
    if (!tableMatch) {
      return { rows: [], rowCount: 0 };
    }
    const tableName = tableMatch[1].toLowerCase();
    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)$/i);

    if (!this.localData[tableName]) {
      return { rows: [], rowCount: 0 };
    }

    let deletedCount = 0;
    const deletedRows: any[] = [];

    this.localData[tableName] = this.localData[tableName].filter(row => {
      let matches = true;
      if (whereMatch) {
        matches = this.evalWhere(row, whereMatch[1], params);
      }
      if (matches) {
        deletedCount++;
        deletedRows.push(row);
        return false;
      }
      return true;
    });

    this.saveLocalStore();
    return { rows: deletedRows as unknown as T[], rowCount: deletedCount };
  }

  private evalWhere(row: any, whereClause: string, params: any[]): boolean {
    const andParts = whereClause.split(/\s+AND\s+/i);
    return andParts.every(part => {
      part = part.trim();
      if (!part) return true;

      // Handle simple expressions: col = $1 or col = 'val' or col != $1
      const opMatch = part.match(/([a-zA-Z0-9_]+)\s*(=|!=|<>|IS\s+NOT\s+NULL|IS\s+NULL|ILIKE|LIKE|IN)\s*(.*)/i);
      if (!opMatch) return true;

      const col = opMatch[1].toLowerCase();
      const op = opMatch[2].toUpperCase().trim();
      let rightValRaw = opMatch[3]?.trim() || '';

      let targetVal: any = rightValRaw;
      if (rightValRaw.startsWith('$')) {
        const pIndex = parseInt(rightValRaw.slice(1), 10) - 1;
        targetVal = params[pIndex];
      } else if (rightValRaw.startsWith("'") && rightValRaw.endsWith("'")) {
        targetVal = rightValRaw.slice(1, -1);
      } else if (rightValRaw.toLowerCase() === 'true') {
        targetVal = true;
      } else if (rightValRaw.toLowerCase() === 'false') {
        targetVal = false;
      }

      const rowVal = row[col];

      if (op === '=' || op === 'IS') {
        return rowVal == targetVal;
      }
      if (op === '!=' || op === '<>') {
        return rowVal != targetVal;
      }
      if (op === 'IS NOT NULL') {
        return rowVal !== null && rowVal !== undefined;
      }
      if (op === 'IS NULL') {
        return rowVal === null || rowVal === undefined;
      }
      if (op === 'ILIKE' || op === 'LIKE') {
        const pattern = String(targetVal || '').replace(/%/g, '.*');
        return new RegExp(pattern, 'i').test(String(rowVal || ''));
      }

      return true;
    });
  }
}

export const db = new RelationalDatabaseEngine();
