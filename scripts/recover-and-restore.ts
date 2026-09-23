import fs from 'fs';
import path from 'path';
import { db } from '../server/db/pool';
import { runMigrations } from '../server/db/migrator';
import { restoreDatabaseFromBackup, parseAndDecryptBackup } from '../server/services/backupService';

async function recoverDatabase() {
  const pgDataDir = 'C:\\projects\\mishkat\\LibraryData\\pgdata';
  const backupDir = 'C:\\projects\\mishkat\\LibraryData\\backups';
  
  // Find latest backup file
  const backupFiles = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('mishkat_backup_') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (backupFiles.length === 0) {
    throw new Error('No backup file found to restore from!');
  }

  const latestBackupPath = path.join(backupDir, backupFiles[0]);
  console.log(`Using latest backup: ${backupFiles[0]}`);

  // Ensure clean directory for db
  if (fs.existsSync(pgDataDir)) {
    const corruptArchive = `C:\\projects\\mishkat\\LibraryData\\pgdata_corrupt_${Date.now()}`;
    fs.renameSync(pgDataDir, corruptArchive);
    console.log(`Archived previous pgdata to: ${corruptArchive}`);
  }
  fs.mkdirSync(pgDataDir, { recursive: true });

  // Connect pool (will initialize fresh PGlite in pgdata)
  console.log('Connecting db pool...');
  await db.connect();
  console.log('db pool connected.');

  // Run migrations & seed core system roles
  await runMigrations();
  console.log('Migrations applied cleanly.');

  const { seedCoreData } = await import('../server/db/seed');
  await seedCoreData();
  console.log('Core system roles seeded.');

  // Restore data from latest backup
  console.log('Restoring data from backup payload...');
  const backupRaw = fs.readFileSync(latestBackupPath, 'utf-8');
  const { data: backupPayload } = parseAndDecryptBackup(backupRaw);

  const restoreResult = await db.transaction(async (client: any) => {
    return await restoreDatabaseFromBackup(backupPayload, client);
  });

  console.log('Restore completed! Restored counts:', restoreResult.restoredCounts);

  // Quick sanity checks
  const { rows: users } = await db.query('SELECT count(*) as count FROM users');
  const { rows: books } = await db.query('SELECT count(*) as count FROM books');
  const { rows: categories } = await db.query('SELECT count(*) as count FROM categories');
  console.log(`Sanity verification: Users=${users[0].count}, Books=${books[0].count}, Categories=${categories[0].count}`);

  await db.close();
  console.log('db closed cleanly. pgdata is 100% restored and healthy!');
}

recoverDatabase().catch((err) => {
  console.error('Recovery failed:', err);
  process.exit(1);
});
