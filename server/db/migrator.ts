import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './pool';

function getMigrationsDir(): string {
  try {
    if (typeof __dirname !== 'undefined') {
      return path.join(__dirname, 'migrations');
    }
    const filename = fileURLToPath(import.meta.url);
    const dirname = path.dirname(filename);
    return path.join(dirname, 'migrations');
  } catch {
    return path.join(process.cwd(), 'server', 'db', 'migrations');
  }
}

export async function runMigrations(): Promise<void> {
  console.log('🔄 [Migrator] Checking database schema and running pending migrations...');
  
  // Ensure schema_migrations table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationsDir = getMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    console.log('ℹ️ [Migrator] No migrations directory found.');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.split('_')[0];
    const { rows } = await db.query('SELECT version FROM schema_migrations WHERE version = $1', [version]);
    
    if (rows.length === 0) {
      console.log(`🚀 [Migrator] Applying migration: ${file}...`);
      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      // Execute migration in a transaction
      await db.transaction(async (client) => {
        // Split statements by semicolon where appropriate
        const statements = sqlContent
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        for (const statement of statements) {
          await client.query(statement);
        }

        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [version, file]
        );
      });

      console.log(`✅ [Migrator] Migration ${file} applied successfully.`);
    } else {
      // already applied
    }
  }

  console.log('✨ [Migrator] All database migrations are up to date.');
}
