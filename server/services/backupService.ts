import fs from 'fs';
import path from 'path';
import { db, IDatabaseClient } from '../db/pool';
import { serverConfig } from '../config';
import { logger } from '../utils/logger';

export const BACKUP_FORMAT_VERSION = '1.0.0';

// 15 persistent application data tables in strict dependency order
export const BACKUP_TABLES_ORDER = [
  'users',
  'categories',
  'books',
  'physical_copies',
  'loans',
  'loan_requests',
  'reading_progress',
  'physical_bookmarks',
  'book_summaries',
  'student_notes',
  'student_favorites',
  'pending_submissions',
  'whitelisted_portals',
  'notifications',
  'system_settings',
] as const;

export type BackupTableName = typeof BACKUP_TABLES_ORDER[number];

// Strict allowlist of known column names per table derived directly from the database schema
export const TABLE_COLUMNS_ALLOWLIST: Record<BackupTableName, string[]> = {
  users: [
    'id', 'username', 'registration_number', 'name', 'email', 'phone',
    'password_hash', 'role_id', 'grade', 'avatar_url', 'is_active',
    'is_blocked', 'is_blocked_from_borrowing', 'block_reason',
    'last_login_at', 'created_at', 'updated_at',
  ],
  categories: [
    'id', 'name', 'name_en', 'description', 'color', 'icon_name',
    'sort_order', 'created_at', 'updated_at',
  ],
  books: [
    'id', 'type', 'title', 'subtitle', 'author', 'publisher', 'publish_year',
    'isbn', 'category_id', 'language', 'summary', 'pages_count', 'tags',
    'cover_image', 'format', 'file_size', 'file_path', 'file_url', 'file_hash',
    'source_origin', 'uploaded_by', 'download_count', 'read_count',
    'table_of_contents', 'sample_content', 'total_copies', 'available_copies',
    'cabinet', 'shelf', 'section', 'created_at', 'updated_at',
  ],
  physical_copies: [
    'id', 'book_id', 'barcode', 'copy_number', 'cabinet', 'shelf',
    'section', 'status', 'condition', 'created_at', 'updated_at',
  ],
  loans: [
    'id', 'book_id', 'book_title', 'copy_id', 'student_id', 'student_name',
    'student_reg_number', 'purpose', 'issue_date', 'due_date', 'return_date',
    'status', 'extension_count', 'max_extensions_allowed', 'notes',
    'is_override_exemption', 'override_reason', 'issued_by', 'returned_by',
    'created_at', 'updated_at',
  ],
  loan_requests: [
    'id', 'book_id', 'book_title', 'book_author', 'cabinet', 'shelf',
    'section', 'student_id', 'student_name', 'student_reg_number',
    'student_grade', 'purpose', 'custom_reason', 'requested_duration_days',
    'requested_at', 'status', 'approved_duration_days', 'approved_at',
    'due_date_calculated', 'admin_notes', 'rejection_reason',
    'handed_over_at', 'loan_record_id', 'created_at', 'updated_at',
  ],
  reading_progress: [
    'id', 'student_id', 'book_id', 'current_page', 'total_pages',
    'percentage', 'last_read_at', 'is_completed', 'is_dismissed',
    'created_at', 'updated_at',
  ],
  physical_bookmarks: [
    'id', 'student_id', 'book_id', 'book_title', 'book_author',
    'cabinet', 'shelf', 'section', 'current_page', 'total_pages',
    'chapter_or_topic', 'last_session_date', 'quick_note',
    'is_completed', 'created_at', 'updated_at',
  ],
  book_summaries: [
    'id', 'student_id', 'book_id', 'book_title', 'book_author',
    'book_medium', 'title', 'structure_type', 'main_idea', 'key_takeaways',
    'chapters_summaries', 'favorite_quotes', 'actionable_insights', 'tags',
    'rating', 'created_at', 'updated_at', 'created_timestamp',
  ],
  student_notes: [
    'id', 'student_id', 'book_id', 'book_title', 'book_medium',
    'page_number', 'chapter', 'quote', 'content', 'color_tag',
    'category', 'tags', 'created_at', 'created_timestamp',
  ],
  student_favorites: [
    'id', 'student_id', 'book_id', 'created_at',
  ],
  pending_submissions: [
    'id', 'title', 'author', 'suggested_category_id', 'format',
    'source_url', 'source_portal_name', 'summary', 'student_id',
    'student_name', 'student_reg_number', 'submitted_at', 'status',
    'admin_feedback', 'reviewed_at', 'reviewed_by', 'temp_file_url',
    'pages_estimated', 'source_portal_id', 'source_record_id',
    'source_record_url', 'source_method', 'source_retrieved_at',
    'verification_status', 'created_at',
  ],
  whitelisted_portals: [
    'id', 'name', 'description', 'url', 'category', 'icon',
    'is_featured', 'notes', 'allowed_domains', 'status',
    'integration_method', 'capabilities', 'last_verified_at',
    'health_status', 'discovery_details', 'created_at',
  ],
  notifications: [
    'id', 'recipient_id', 'recipient_role', 'title', 'message',
    'type', 'target_tab', 'target_entity_id', 'is_read', 'created_at',
    'created_timestamp',
  ],
  system_settings: [
    'key', 'value', 'updated_at',
  ],
};

export interface BackupMetadata {
  exportedAt: string;
  exportedBy: string;
  version: string;
  application?: string;
  type?: 'manual' | 'pre_restore';
}

export interface BackupData {
  meta: BackupMetadata;
  data: Record<BackupTableName, any[]>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  tableCounts?: Record<string, number>;
}

// Test-only failure hook mechanism strictly guarded by NODE_ENV === 'test'
export type RestoreTestHookStage = 'after_truncate' | 'mid_insert' | 'before_commit';
let testFailureHook: ((stage: RestoreTestHookStage, client: IDatabaseClient) => Promise<void> | void) | null = null;

export function setRestoreTestFailureHook(
  hook: ((stage: RestoreTestHookStage, client: IDatabaseClient) => Promise<void> | void) | null
): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Restore test failure hook can only be used when NODE_ENV === test');
  }
  testFailureHook = hook;
}

/**
 * Validates a backup JSON payload thoroughly before destructive restore.
 */
export function validateBackupPayload(parsed: any): ValidationResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'ملف النسخة الاحتياطية غير صالح (صيغة JSON غير مطابقة).' };
  }

  // 1. Validate meta
  if (!parsed.meta || typeof parsed.meta !== 'object') {
    return { valid: false, error: 'بيانات التعريف الوصفية (meta) مفقودة في النسخة الاحتياطية.' };
  }

  const version = parsed.meta.version || parsed.meta.formatVersion;
  if (!version || (version !== '1.0.0' && version !== 1)) {
    return { valid: false, error: `إصدار النسخة الاحتياطية (${version}) غير مدعوم من قبل هذا النظام.` };
  }

  // 2. Validate data object
  if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    return { valid: false, error: 'قسم البيانات (data) مفقود أو غير صالح في النسخة الاحتياطية.' };
  }

  // Backward-compatibility: if notifications is missing from older 14-table backup, default to empty array
  if (!parsed.data.notifications) {
    parsed.data.notifications = [];
  }

  // 3. Verify all expected tables exist and are arrays
  for (const table of BACKUP_TABLES_ORDER) {
    const tableData = parsed.data[table];
    if (!Array.isArray(tableData)) {
      return { valid: false, error: `جدول البيانات (${table}) مفقود أو لا يحتوي على مصفوفة بيانات صالحة.` };
    }
  }

  // 4. Validate Users table content (must contain at least 1 active admin)
  const users = parsed.data.users as any[];
  const userIds = new Set<string>();
  let hasActiveAdmin = false;

  for (const u of users) {
    if (!u.id || !u.registration_number || !u.name || !u.password_hash) {
      return { valid: false, error: 'سجل مستخدم غير مكتمل الحقول الأساسية في النسخة الاحتياطية.' };
    }
    if (userIds.has(u.id)) {
      return { valid: false, error: `تكرار في المعرف الأساسي للمستخدم: ${u.id}` };
    }
    userIds.add(u.id);

    if (u.role_id === 'admin' && (u.is_active === true || u.is_active === undefined)) {
      hasActiveAdmin = true;
    }
  }

  if (!hasActiveAdmin) {
    return {
      valid: false,
      error: 'لا تحتوي النسخة الاحتياطية على أي حساب مدير نشط (Admin). استرجاع هذه النسخة سيقفل النظام.',
    };
  }

  // 5. Validate Categories
  const categoryIds = new Set<string>();
  for (const c of parsed.data.categories) {
    if (!c.id || !c.name) {
      return { valid: false, error: 'سجل تصنيف غير مكتمل الحقول الأساسية في النسخة الاحتياطية.' };
    }
    if (categoryIds.has(c.id)) {
      return { valid: false, error: `تكرار في المعرف الأساسي للتصنيف: ${c.id}` };
    }
    categoryIds.add(c.id);
  }

  // 6. Validate Books & constraints
  const bookIds = new Set<string>();
  for (const b of parsed.data.books) {
    if (!b.id || !b.title || !b.author || !b.type) {
      return { valid: false, error: 'سجل كتاب غير مكتمل الحقول الأساسية في النسخة الاحتياطية.' };
    }
    if (b.type !== 'physical' && b.type !== 'digital') {
      return { valid: false, error: `نوع كتاب غير صالح (${b.type}) في الكتاب معرف: ${b.id}` };
    }
    if (b.format && b.format !== 'pdf' && b.format !== 'epub') {
      return { valid: false, error: `امتداد رقمي غير صالح (${b.format}) في الكتاب معرف: ${b.id}` };
    }
    if (bookIds.has(b.id)) {
      return { valid: false, error: `تكرار في المعرف الأساسي للكتاب: ${b.id}` };
    }
    bookIds.add(b.id);
  }

  // 7. Validate Physical Copies
  const copyIds = new Set<string>();
  const barcodes = new Set<string>();
  for (const pc of parsed.data.physical_copies) {
    if (!pc.id || !pc.book_id || !pc.barcode) {
      return { valid: false, error: 'سجل نسخة فيزيائية غير مكتمل في النسخة الاحتياطية.' };
    }
    if (!bookIds.has(pc.book_id)) {
      return { valid: false, error: `النسخة الفيزيائية ${pc.id} ترتبط بكتاب غير موجود (${pc.book_id}).` };
    }
    if (copyIds.has(pc.id)) {
      return { valid: false, error: `تكرار في معرف النسخة الفيزيائية: ${pc.id}` };
    }
    if (barcodes.has(pc.barcode)) {
      return { valid: false, error: `تكرار في باركود النسخة الفيزيائية: ${pc.barcode}` };
    }
    copyIds.add(pc.id);
    barcodes.add(pc.barcode);
  }

  // 8. Validate Loans
  const loanIds = new Set<string>();
  for (const l of parsed.data.loans) {
    if (!l.id || !l.book_id || !l.student_id || !l.status) {
      return { valid: false, error: 'سجل إعارة غير مكتمل في النسخة الاحتياطية.' };
    }
    if (!bookIds.has(l.book_id)) {
      return { valid: false, error: `سجل الإعارة ${l.id} يرتبط بكتاب غير موجود (${l.book_id}).` };
    }
    if (!userIds.has(l.student_id)) {
      return { valid: false, error: `سجل الإعارة ${l.id} يرتبط بطالب غير موجود (${l.student_id}).` };
    }
    if (l.copy_id && !copyIds.has(l.copy_id)) {
      return { valid: false, error: `سجل الإعارة ${l.id} يرتبط بنسخة فيزيائية غير موجودة (${l.copy_id}).` };
    }
    if (loanIds.has(l.id)) {
      return { valid: false, error: `تكرار في معرف سجل الإعارة: ${l.id}` };
    }
    loanIds.add(l.id);
  }

  // 9. Validate Notifications
  const notificationIds = new Set<string>();
  for (const n of parsed.data.notifications) {
    if (!n.id || !n.recipient_id || !n.title || !n.message) {
      return { valid: false, error: 'سجل إشعار غير مكتمل الحقول الأساسية في النسخة الاحتياطية.' };
    }
    if (notificationIds.has(n.id)) {
      return { valid: false, error: `تكرار في المعرف الأساسي للإشعار: ${n.id}` };
    }
    notificationIds.add(n.id);
  }

  // 10. Calculate table counts
  const tableCounts: Record<string, number> = {};
  for (const table of BACKUP_TABLES_ORDER) {
    tableCounts[table] = (parsed.data[table] || []).length;
  }

  return {
    valid: true,
    tableCounts,
  };
}

/**
 * Creates a complete database snapshot in memory and writes to a file.
 */
export async function createDatabaseBackup(
  exportedBy: string,
  backupType: 'manual' | 'pre_restore' = 'manual'
): Promise<{ fileName: string; filePath: string; tablesCount: number; data: BackupData }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = backupType === 'pre_restore' ? 'mishkat_pre_restore' : 'mishkat_backup';
  const fileName = `${prefix}_${timestamp}.json`;
  const filePath = path.join(serverConfig.dirs.backups, fileName);

  const backupDump: BackupData = {
    meta: {
      exportedAt: new Date().toISOString(),
      exportedBy,
      version: BACKUP_FORMAT_VERSION,
      application: 'MISHKAT',
      type: backupType,
    },
    data: {} as Record<BackupTableName, any[]>,
  };

  for (const table of BACKUP_TABLES_ORDER) {
    const { rows } = await db.query(`SELECT * FROM ${table}`);
    backupDump.data[table] = rows;
  }

  if (!fs.existsSync(serverConfig.dirs.backups)) {
    fs.mkdirSync(serverConfig.dirs.backups, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(backupDump, null, 2), 'utf8');

  // Apply backup retention policy
  pruneOldBackups();

  return {
    fileName,
    filePath,
    tablesCount: BACKUP_TABLES_ORDER.length,
    data: backupDump,
  };
}

/**
 * Prunes older backups to maintain healthy storage:
 * - Keeps the 10 most recent manual backups
 * - Keeps the 5 most recent pre-restore safety backups
 * - Never deletes the only remaining backup
 */
export function pruneOldBackups(): void {
  try {
    const dir = serverConfig.dirs.backups;
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

    const manualBackups = files
      .filter((f) => f.startsWith('mishkat_backup_'))
      .map((f) => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    const preRestoreBackups = files
      .filter((f) => f.startsWith('mishkat_pre_restore_'))
      .map((f) => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    // Keep top 10 manual backups
    if (manualBackups.length > 10) {
      for (let i = 10; i < manualBackups.length; i++) {
        try { fs.unlinkSync(path.join(dir, manualBackups[i].name)); } catch {}
      }
    }

    // Keep top 5 pre-restore backups
    if (preRestoreBackups.length > 5) {
      for (let i = 5; i < preRestoreBackups.length; i++) {
        try { fs.unlinkSync(path.join(dir, preRestoreBackups[i].name)); } catch {}
      }
    }
  } catch (err: any) {
    logger.warn('[BackupService] Backup pruning warning:', err.message);
  }
}

/**
 * Restores database from a validated backup JSON payload within a single ACID transaction.
 */
export async function restoreDatabaseFromBackup(
  backup: BackupData,
  client: IDatabaseClient
): Promise<{ restoredCounts: Record<string, number> }> {
  // 1. Truncate all 15 dynamic relational tables in clean CASCADE
  await client.query(`
    TRUNCATE TABLE
      notifications,
      student_notes,
      book_summaries,
      physical_bookmarks,
      reading_progress,
      student_favorites,
      loans,
      loan_requests,
      pending_submissions,
      whitelisted_portals,
      physical_copies,
      books,
      categories,
      users,
      system_settings
    CASCADE;
  `);

  if (process.env.NODE_ENV === 'test' && testFailureHook) {
    await testFailureHook('after_truncate', client);
  }

  const restoredCounts: Record<string, number> = {};

  // 2. Insert records table-by-table in dependency order using safe parameterized SQL
  for (const table of BACKUP_TABLES_ORDER) {
    const rows = backup.data[table] || [];
    const allowedColumns = TABLE_COLUMNS_ALLOWLIST[table];
    restoredCounts[table] = rows.length;

    for (const row of rows) {
      // Extract columns present in both the row and the table allowlist
      const activeColumns: string[] = [];
      const values: any[] = [];
      const placeholders: string[] = [];

      for (const col of allowedColumns) {
        if (row[col] !== undefined) {
          activeColumns.push(col);
          let val = row[col];
          // Serialize JSONB objects/arrays to string for postgres jsonb compatibility
          if (
            val !== null &&
            typeof val === 'object' &&
            !Array.isArray(val) &&
            !(val instanceof Date)
          ) {
            val = JSON.stringify(val);
          }
          values.push(val);
          placeholders.push(`$${values.length}`);
        }
      }

      if (activeColumns.length > 0) {
        // Safe SQL constructed exclusively from allowlisted column names with parameter bindings
        const sql = `INSERT INTO ${table} (${activeColumns.join(', ')}) VALUES (${placeholders.join(', ')})`;
        await client.query(sql, values);
      }
    }

    // If test failure hook is registered, invoke it after inserting books (multiple tables written!)
    if (process.env.NODE_ENV === 'test' && testFailureHook && table === 'books') {
      await testFailureHook('mid_insert', client);
    }
  }

  // 3. Post-Restore Integrity Checks (before commit)
  // Ensure at least 1 active admin exists
  const { rows: adminRows } = await client.query(
    "SELECT id FROM users WHERE role_id = 'admin' AND (is_active = true OR is_active IS NULL) LIMIT 1"
  );
  if (adminRows.length === 0) {
    throw new Error('فشل التحقق من سلامة البيانات: لم يتم العثور على حساب مدير نشط بعد الاسترجاع.');
  }

  if (process.env.NODE_ENV === 'test' && testFailureHook) {
    await testFailureHook('before_commit', client);
  }

  return { restoredCounts };
}
