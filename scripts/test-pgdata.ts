import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

async function testPgData() {
  const dir = 'C:\\projects\\mishkat\\LibraryData\\pgdata';
  const pid = path.join(dir, 'postmaster.pid');
  if (fs.existsSync(pid)) {
    fs.unlinkSync(pid);
    console.log('Removed postmaster.pid');
  }

  try {
    const db = new PGlite(dir);
    await db.query('SELECT 1');
    console.log('PGlite connected successfully to pgdata!');
    await db.close();
  } catch (err: any) {
    console.error('Error connecting to pgdata:', err);
  }
}

testPgData().catch(console.error);
