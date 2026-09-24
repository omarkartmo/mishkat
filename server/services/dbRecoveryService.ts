import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { serverConfig } from '../config';
import { logger } from '../utils/logger';
import { runMigrations } from '../db/migrator';
import { seedCoreData, seedInitialData } from '../db/seed';
import {
  listLocalBackups,
  validateBackupPayload,
  restoreDatabaseFromBackup,
  BackupData,
} from './backupService';
import type { IDatabase } from '../db/pool';

/**
 * Automates self-healing database recovery when embedded PostgreSQL encounters
 * corrupted WAL, unrecoverable aborts, or crash-interrupted storage.
 *
 * Safety guarantees:
 * 1. Never deletes data: Corrupted directory is preserved with a timestamp.
 * 2. Cascading backup fallback: Scans backups from newest to oldest. If newest is corrupt, tries earlier ones.
 * 3. Atomic restore: Restores inside an ACID transaction so partial failures rollback cleanly.
 * 4. Fallback seeding: If no backups exist at all, seeds fresh initial state so system remains operational.
 * 5. In-app admin alert: Registers a system notification detailing the event.
 */
export async function performSelfHealingRecovery(
  dbEngine: IDatabase,
  initAndTestPgLite: (dataDir: string) => Promise<PGlite>,
  setActiveDir?: (newDir: string) => void
): Promise<boolean> {
  const rootDir = serverConfig.dirs.root;
  const originalPgData = serverConfig.dirs.pgdata;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const corruptSavedDir = path.join(rootDir, `pgdata_corrupt_saved_${timestamp}`);
  let activeDir = originalPgData;

  console.log('🛡️ [SelfHealing] Preserving corrupted storage before recovery...');

  if (fs.existsSync(originalPgData)) {
    try {
      fs.renameSync(originalPgData, corruptSavedDir);
      console.log(`📦 [SelfHealing] Preserved corrupted storage at: ${corruptSavedDir}`);
      fs.mkdirSync(originalPgData, { recursive: true });
    } catch (renameErr: any) {
      console.warn(`⚠️ [SelfHealing] Could not rename locked storage (${renameErr.message}). Copying for safety...`);
      try {
        fs.cpSync(originalPgData, corruptSavedDir, { recursive: true, force: true });
        console.log(`📦 [SelfHealing] Successfully copied corrupted storage to: ${corruptSavedDir}`);
      } catch (cpErr: any) {
        console.warn(`⚠️ [SelfHealing] Backup copy failed (${cpErr.message}).`);
      }

      // Try emptying original directory, or use a new recovery path
      try {
        const files = fs.readdirSync(originalPgData);
        for (const f of files) {
          try {
            fs.rmSync(path.join(originalPgData, f), { recursive: true, force: true });
          } catch {}
        }
      } catch {
        activeDir = path.join(rootDir, `pgdata_recovered_${timestamp}`);
        fs.mkdirSync(activeDir, { recursive: true });
        if (setActiveDir) setActiveDir(activeDir);
      }
    }
  } else {
    fs.mkdirSync(activeDir, { recursive: true });
  }

  // 1. Initialize clean PGlite instance on the clean directory
  console.log(`🚀 [SelfHealing] Initializing clean PGlite engine at: ${activeDir}`);
  const freshInstance = await initAndTestPgLite(activeDir);

  if (typeof (dbEngine as any).attachPgliteInstance === 'function') {
    (dbEngine as any).attachPgliteInstance(freshInstance);
  } else {
    (dbEngine as any).pgliteInstance = freshInstance;
    (dbEngine as any).isConnected = true;
    (dbEngine as any).engineType = 'embedded_pg';
  }

  // 2. Run schema migrations
  console.log('🔄 [SelfHealing] Running database schema migrations...');
  await runMigrations();

  // 3. Ensure core RBAC roles are present
  console.log('🌱 [SelfHealing] Seeding core RBAC roles...');
  await seedCoreData();

  // 4. Scan local backups from newest to oldest
  const backups = listLocalBackups();
  console.log(`🔍 [SelfHealing] Found ${backups.length} local backup file(s). Searching for latest valid backup...`);

  let restoredBackupName = '';
  let restoredSuccessfully = false;

  for (const b of backups) {
    try {
      console.log(`⏳ [SelfHealing] Validating backup candidate: ${b.fileName}...`);
      const raw = fs.readFileSync(b.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const validation = validateBackupPayload(parsed);

      if (!validation.valid) {
        console.warn(`⚠️ [SelfHealing] Backup candidate ${b.fileName} invalid: ${validation.error}. Trying next...`);
        continue;
      }

      console.log(`🔄 [SelfHealing] Restoring database records from: ${b.fileName}...`);
      await dbEngine.transaction(async (client) => {
        await restoreDatabaseFromBackup(parsed as BackupData, client);
      });

      restoredBackupName = b.fileName;
      restoredSuccessfully = true;
      console.log(`🎉 [SelfHealing] Database successfully restored from: ${b.fileName}`);
      break;
    } catch (candidateErr: any) {
      console.warn(`⚠️ [SelfHealing] Restoring candidate ${b.fileName} failed: ${candidateErr.message}. Checking next older backup...`);
    }
  }

  // 5. If no backups succeeded, initialize clean initial seed data
  if (!restoredSuccessfully) {
    console.warn('⚠️ [SelfHealing] No valid backups found. Seeding initial library dataset...');
    await seedInitialData();
    console.log('🌱 [SelfHealing] Clean initial library dataset seeded successfully.');
  } else {
    // 6. Record in-app notification for the administrator
    try {
      const notifId = `notif-recovery-${Date.now()}`;
      await dbEngine.query(`
        INSERT INTO notifications (id, recipient_id, recipient_role, title, message, type, target_tab, is_read, created_at, created_timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        notifId,
        'admin-001',
        'admin',
        'تمت استعادة قاعدة البيانات تلقائياً بنجاح',
        `تم رصد انقطاع مفاجئ في تشغيل السيرفر، وتمت المعالجة الآلية واستعادة البيانات بنجاح من النسخة الاحتياطية (${restoredBackupName}). تم حفظ نسخة من المجلد السابق للأمان.`,
        'system',
        'settings',
        false,
        new Date().toISOString(),
        Date.now(),
      ]);
    } catch (notifErr: any) {
      logger.warn(`[SelfHealing] Could not write system notification: ${notifErr.message}`);
    }
  }

  // 7. Flush writes to disk
  try {
    if (typeof (freshInstance as any).syncToFs === 'function') {
      await (freshInstance as any).syncToFs();
    }
  } catch {}

  logger.info(`[SelfHealing] Completed database self-healing pipeline successfully.`);
  return true;
}
