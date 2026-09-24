import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../server/db/pool';
import { serverConfig } from '../server/config';
import { performSelfHealingRecovery } from '../server/services/dbRecoveryService';
import {
  createDatabaseBackup,
  listLocalBackups,
  validateBackupPayload,
} from '../server/services/backupService';
import { PGlite } from '@electric-sql/pglite';

describe('MISHKAT: Automated Database Self-Healing & Recovery Suite', () => {
  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.close();
  });

  it('validates backup payloads and rejects corrupted or admin-less data', () => {
    // Completely invalid
    expect(validateBackupPayload(null).valid).toBe(false);
    expect(validateBackupPayload({}).valid).toBe(false);

    // Missing admin
    const noAdminPayload = {
      meta: { version: '1.0.0' },
      data: {
        users: [{ id: 'stu-1', registration_number: 'STU-1', name: 'Student', password_hash: 'hash', role_id: 'student' }],
        categories: [{ id: 'cat-1', name: 'General' }],
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
        staging_queue: [],
        blocked_categories: [],
        blocked_sites: [],
      },
    };
    const validation = validateBackupPayload(noAdminPayload);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('حساب مدير نشط');
  });

  it('correctly sorts local backups by creation time (newest first)', async () => {
    const backups = listLocalBackups();
    expect(Array.isArray(backups)).toBe(true);

    if (backups.length > 1) {
      const firstTime = new Date(backups[0].createdAt).getTime();
      const secondTime = new Date(backups[1].createdAt).getTime();
      expect(firstTime).toBeGreaterThanOrEqual(secondTime);
    }
  });

  it('executes self-healing recovery, preserves corrupted data, and restores healthy state', async () => {
    // 1. Ensure we have at least one valid backup on disk
    const backupRes = await createDatabaseBackup('TEST_SUITE');
    expect(fs.existsSync(backupRes.filePath)).toBe(true);

    // 2. Plant a bogus, corrupted JSON backup that should be skipped by self-healing
    const bogusBackupPath = path.join(
      serverConfig.dirs.backups,
      `mishkat_backup_9999-99-99T99-99-99-999Z.json`
    );
    fs.writeFileSync(bogusBackupPath, '{ invalid json corrupted content ...', 'utf8');

    // 3. Define a mock initAndTestPgLite
    const initAndTestPgLite = async (dataDir: string): Promise<PGlite> => {
      const inst = new PGlite(dataDir);
      await inst.query('SELECT 1');
      return inst;
    };

    // 4. Run performSelfHealingRecovery
    const success = await performSelfHealingRecovery(db, initAndTestPgLite);
    expect(success).toBe(true);

    // 5. Verify database is operational and has books and admin
    const { rows: books } = await db.query('SELECT count(*) as count FROM books');
    expect(Number(books[0].count)).toBeGreaterThan(0);

    const { rows: admin } = await db.query("SELECT id, role_id FROM users WHERE role_id = 'admin'");
    expect(admin.length).toBeGreaterThan(0);

    // 6. Verify admin recovery notification was registered
    const { rows: notifs } = await db.query(
      "SELECT title, message FROM notifications WHERE title LIKE '%استعادة قاعدة البيانات%' LIMIT 1"
    );
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].message).toContain('تم رصد انقطاع مفاجئ');

    // Clean up bogus test backup
    if (fs.existsSync(bogusBackupPath)) {
      fs.unlinkSync(bogusBackupPath);
    }
  });
});
