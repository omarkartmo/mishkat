import { db } from '../db/pool';
import { logger } from '../utils/logger';

export const EXPORT_FORMAT_VERSION = '1.0.0';

export interface ExportUserInfo {
  id: string;
  name: string;
  role: string;
}

export interface InstitutionalExportPayload {
  export_version: string;
  application_name: string;
  application_version: string;
  exported_at: string;
  exported_by: ExportUserInfo;
  description: string;
  entities_count: Record<string, number>;
  data: {
    users: any[];
    categories: any[];
    books: any[];
    physical_copies: any[];
    loans: any[];
    loan_requests: any[];
    reading_progress: any[];
    physical_bookmarks: any[];
    book_summaries: any[];
    student_notes: any[];
    student_favorites: any[];
    pending_submissions: any[];
    whitelisted_portals: any[];
    notifications: any[];
    system_settings: any[];
  };
}

/**
 * Generates a clean, portable, unencrypted JSON export of institutional library data.
 * All sensitive security tokens, passwords, and password hashes are strictly omitted.
 */
export async function generateInstitutionalExport(
  exportedBy: ExportUserInfo
): Promise<InstitutionalExportPayload> {
  logger.info(`[ExportService] Initiating institutional data export by user ${exportedBy.name} (${exportedBy.id})`);

  // 1. Fetch and sanitize users (Strictly omitting password hashes, security answers, token versions)
  const { rows: rawUsers } = await db.query(`
    SELECT
      id, username, registration_number, name, email, phone,
      role_id, grade, avatar_url, is_active, is_blocked,
      is_blocked_from_borrowing, block_reason, last_login_at,
      created_at, updated_at
    FROM users
    ORDER BY created_at ASC
  `);

  // 2. Fetch categories
  const { rows: categories } = await db.query(`SELECT * FROM categories ORDER BY sort_order ASC, name ASC`);

  // 3. Fetch books
  const { rows: books } = await db.query(`SELECT * FROM books ORDER BY created_at ASC`);

  // 4. Fetch physical copies
  const { rows: physical_copies } = await db.query(`SELECT * FROM physical_copies ORDER BY created_at ASC`);

  // 5. Fetch loans
  const { rows: loans } = await db.query(`SELECT * FROM loans ORDER BY created_at ASC`);

  // 6. Fetch loan requests
  const { rows: loan_requests } = await db.query(`SELECT * FROM loan_requests ORDER BY created_at ASC`);

  // 7. Fetch reading progress
  const { rows: reading_progress } = await db.query(`SELECT * FROM reading_progress ORDER BY updated_at ASC`);

  // 8. Fetch physical bookmarks
  const { rows: physical_bookmarks } = await db.query(`SELECT * FROM physical_bookmarks ORDER BY updated_at ASC`);

  // 9. Fetch book summaries
  const { rows: book_summaries } = await db.query(`SELECT * FROM book_summaries ORDER BY created_at ASC`);

  // 10. Fetch student notes
  const { rows: student_notes } = await db.query(`SELECT * FROM student_notes ORDER BY created_at ASC`);

  // 11. Fetch student favorites
  const { rows: student_favorites } = await db.query(`SELECT * FROM student_favorites ORDER BY created_at ASC`);

  // 12. Fetch pending submissions
  const { rows: pending_submissions } = await db.query(`SELECT * FROM pending_submissions ORDER BY submitted_at ASC`);

  // 13. Fetch whitelisted portals
  const { rows: whitelisted_portals } = await db.query(`SELECT * FROM whitelisted_portals ORDER BY created_at ASC`);

  // 14. Fetch notifications
  const { rows: notifications } = await db.query(`SELECT * FROM notifications ORDER BY created_at ASC`);

  // 15. Fetch safe system settings (Exclude any sensitive keys containing key, secret, password, or token)
  const { rows: rawSettings } = await db.query(`SELECT key, value, updated_at FROM system_settings`);
  const safeSettings = rawSettings.filter((s: { key: string }) => {
    const k = s.key.toLowerCase();
    return !k.includes('secret') && !k.includes('password') && !k.includes('token') && !k.includes('key');
  });

  const entitiesCount: Record<string, number> = {
    users: rawUsers.length,
    categories: categories.length,
    books: books.length,
    physical_copies: physical_copies.length,
    loans: loans.length,
    loan_requests: loan_requests.length,
    reading_progress: reading_progress.length,
    physical_bookmarks: physical_bookmarks.length,
    book_summaries: book_summaries.length,
    student_notes: student_notes.length,
    student_favorites: student_favorites.length,
    pending_submissions: pending_submissions.length,
    whitelisted_portals: whitelisted_portals.length,
    notifications: notifications.length,
    system_settings: safeSettings.length,
  };

  const payload: InstitutionalExportPayload = {
    export_version: EXPORT_FORMAT_VERSION,
    application_name: 'MISHKAT',
    application_version: '1.0.0',
    exported_at: new Date().toISOString(),
    exported_by: exportedBy,
    description: 'نسخة تصدير بيانات المؤسسة المفتوحة لترحيل البيانات أو أرشفتها المستقلة (غير مشفرة وخالية من الأسرار)',
    entities_count: entitiesCount,
    data: {
      users: rawUsers,
      categories,
      books,
      physical_copies,
      loans,
      loan_requests,
      reading_progress,
      physical_bookmarks,
      book_summaries,
      student_notes,
      student_favorites,
      pending_submissions,
      whitelisted_portals,
      notifications,
      system_settings: safeSettings,
    },
  };

  logger.info(`[ExportService] Institutional export generated successfully: ${JSON.stringify(entitiesCount)}`);
  return payload;
}
