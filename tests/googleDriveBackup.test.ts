import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { Express } from 'express';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';
import { serverConfig } from '../server/config';
import {
  createDatabaseBackup,
  pruneOldBackups,
  LOCAL_BACKUP_RETENTION_LIMIT,
} from '../server/services/backupService';
import {
  googleDriveService,
  CLOUD_BACKUP_RETENTION_LIMIT,
  DRIVE_BACKUPS_FOLDER_NAME,
} from '../server/services/googleDriveService';
import { backupScheduler } from '../server/services/backupScheduler';

import bcrypt from 'bcryptjs';

let app: Express;
let adminToken: string;
let studentToken: string;
let mockRemoteFiles: Array<{ id: string; name: string; size: string; createdTime: string; parents?: string[] }> = [];
let mockDrive: any;

beforeAll(async () => {
  app = await createExpressApp();

  // Ensure admin and student credentials are valid for test isolation
  const adminPassHash = await bcrypt.hash('admin123', 10);
  await db.query(`
    INSERT INTO users (id, registration_number, name, email, role_id, password_hash, is_active, is_blocked)
    VALUES ('admin-001', 'ADM-001', 'أمين المكتبة', 'admin@mishkat.edu', 'admin', $1, true, false)
    ON CONFLICT (registration_number) DO UPDATE SET password_hash = $1, role_id = 'admin', is_active = true, is_blocked = false;
  `, [adminPassHash]);

  const studentPassHash = await bcrypt.hash('123456', 10);
  await db.query(`
    INSERT INTO users (id, registration_number, name, role_id, grade, password_hash, is_active, is_blocked, is_blocked_from_borrowing)
    VALUES ('stu-001', 'STU-2026-101', 'طالب تجريبي', 'student', 'الصف العاشر', $1, true, false, false)
    ON CONFLICT (registration_number) DO UPDATE SET password_hash = $1, role_id = 'student', is_active = true, is_blocked = false;
  `, [studentPassHash]);

  googleDriveService.saveConfig({
    clientId: 'mock-client-id-12345',
    clientSecret: 'mock-client-secret-67890',
  });

  googleDriveService.saveTokens({
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'Bearer',
    expiry_date: Date.now() + 3600_000,
  });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });
  adminToken = adminLogin.body.data.token;

  const studentLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });
  studentToken = studentLogin.body.data.token;
});

describe('MISHKAT: Automatic Backup, Local Retention & Google Drive Integration Suite', () => {
  describe('1. Local 7-Version Retention Policy & Atomic Disk Safety', () => {
    it('strictly enforces local retention: keeps exactly the latest 7 backups and deletes oldest', async () => {
      const backupDir = serverConfig.dirs.backups;

      // Clean up previous test backups to test retention deterministically
      const initialFiles = fs.readdirSync(backupDir).filter((f) => f.startsWith('mishkat_backup_'));
      for (const f of initialFiles) {
        try { fs.unlinkSync(path.join(backupDir, f)); } catch {}
      }

      // Create 9 simulated backup files with staggered timestamps
      const testNames: string[] = [];
      const now = Date.now();
      for (let i = 0; i < 9; i++) {
        const name = `mishkat_backup_2026-09-${String(10 + i).padStart(2, '0')}T00-00-00-000Z.json`;
        const filePath = path.join(backupDir, name);
        fs.writeFileSync(filePath, JSON.stringify({ meta: { version: '1.0.0' }, data: {} }), 'utf8');
        // Set artificial mtime to simulate creation order
        const time = (now - (10 - i) * 60_000) / 1000;
        fs.utimesSync(filePath, time, time);
        testNames.push(name);
      }

      expect(fs.readdirSync(backupDir).filter((f) => f.startsWith('mishkat_backup_')).length).toBe(9);

      // Run pruning
      pruneOldBackups();

      const remainingFiles = fs.readdirSync(backupDir).filter((f) => f.startsWith('mishkat_backup_'));
      expect(remainingFiles.length).toBe(LOCAL_BACKUP_RETENTION_LIMIT); // Exactly 7
      expect(remainingFiles.length).toBe(7);

      // Verify the two oldest files were deleted
      expect(remainingFiles).not.toContain(testNames[0]);
      expect(remainingFiles).not.toContain(testNames[1]);

      // Verify the newest 7 files were preserved
      for (let i = 2; i < 9; i++) {
        expect(remainingFiles).toContain(testNames[i]);
      }

      // Cleanup
      for (const f of remainingFiles) {
        try { fs.unlinkSync(path.join(backupDir, f)); } catch {}
      }
    });

    it('cleans up temporary file and leaves existing backups intact on simulated disk write failure', async () => {
      // Create a valid existing backup
      const validBackup = await createDatabaseBackup('Test Admin', 'manual');
      const backupDir = serverConfig.dirs.backups;
      expect(fs.existsSync(validBackup.filePath)).toBe(true);

      // Spy on fs.renameSync to simulate failure during atomic move (e.g. disk full / lock)
      const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      try {
        await expect(createDatabaseBackup('Fail Tester', 'manual')).rejects.toThrow('no space left on device');

        // Verify existing valid backup was NOT corrupted or deleted
        expect(fs.existsSync(validBackup.filePath)).toBe(true);

        // Verify no leftover .tmp files
        const tmpFiles = fs.readdirSync(backupDir).filter((f) => f.endsWith('.tmp'));
        expect(tmpFiles.length).toBe(0);
      } finally {
        renameSpy.mockRestore();
        try { fs.unlinkSync(validBackup.filePath); } catch {}
      }
    });
  });

  describe('2. Google Drive Cloud Integration, Duplicate Prevention & Cloud Retention', () => {
    // Construct mock drive client
    mockDrive = {
      files: {
        list: vi.fn().mockImplementation(async ({ q }) => {
          if (q.includes(`name = '${DRIVE_BACKUPS_FOLDER_NAME}'`)) {
            return { data: { files: [{ id: 'mock-folder-id-123', name: DRIVE_BACKUPS_FOLDER_NAME }] } };
          }
          if (q.includes('name =')) {
            const matchName = q.match(/name = '([^']+)'/);
            const targetName = matchName ? matchName[1] : '';
            const found = mockRemoteFiles.filter((f) => f.name === targetName);
            return { data: { files: found } };
          }
          return { data: { files: [...mockRemoteFiles] } };
        }),
        create: vi.fn().mockImplementation(async ({ requestBody, media }) => {
          if (media && media.body) {
            media.body.on('error', () => {});
            if (typeof media.body.destroy === 'function') media.body.destroy();
          }
          if (requestBody.mimeType === 'application/vnd.google-apps.folder') {
            return { data: { id: 'mock-folder-id-123', name: requestBody.name } };
          }
          const newFile = {
            id: `drive-file-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: requestBody.name,
            size: '15360',
            createdTime: new Date().toISOString(),
          };
          mockRemoteFiles.unshift(newFile);
          return { data: newFile };
        }),
        delete: vi.fn().mockImplementation(async ({ fileId }) => {
          mockRemoteFiles = mockRemoteFiles.filter((f) => f.id !== fileId);
          return { data: {} };
        }),
        update: vi.fn().mockImplementation(async ({ fileId, addParents, removeParents }: any) => {
          const file = mockRemoteFiles.find((f) => f.id === fileId);
          if (file) {
            (file as any).parents = [addParents];
          }
          return { data: file || { id: fileId } };
        }),
        get: vi.fn().mockImplementation(async ({ fileId }) => {
          if (fileId.startsWith('folder-') || fileId.includes('mock-folder')) {
            return { data: { id: fileId, name: DRIVE_BACKUPS_FOLDER_NAME, trashed: false } };
          }
          // Return mock stream with authentic current users so tokens remain valid
          const { rows: currentUsers } = await db.query('SELECT * FROM users');
          const { rows: currentCats } = await db.query('SELECT * FROM categories');
          const { Readable } = await import('stream');
          const sampleBackup = {
            meta: { version: '1.0.0', exportedAt: new Date().toISOString(), exportedBy: 'Cloud Admin' },
            data: {
              users: currentUsers,
              categories: currentCats,
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
            },
          };
          const stream = Readable.from([JSON.stringify(sampleBackup, null, 2)]);
          return { data: stream };
        }),
      },
    } as any;

    beforeAll(() => {
      googleDriveService.setMockDriveClient(mockDrive);
      // Mock saved tokens
      googleDriveService.saveTokens({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600_000,
      });
      mockRemoteFiles = [];
    });

    it('Scenario A: uploads backup to Google Drive inside "MISHKAT Backups" folder', async () => {
      const local = await createDatabaseBackup('Admin User', 'manual');
      try {
        const uploadResult = await googleDriveService.uploadBackup(local.filePath, local.fileName);

        expect(uploadResult.fileId).toBeDefined();
        expect(uploadResult.fileName).toBe(local.fileName);
        expect(uploadResult.isDuplicate).toBe(false);
        expect(mockRemoteFiles.length).toBe(1);
        expect(mockRemoteFiles[0].name).toBe(local.fileName);
      } finally {
        try { fs.unlinkSync(local.filePath); } catch {}
      }
    });

    it('Scenario D: prevents duplicate uploads when uploading the same backup file', async () => {
      const local = await createDatabaseBackup('Admin User', 'manual');
      try {
        // First upload
        const firstUpload = await googleDriveService.uploadBackup(local.filePath, local.fileName);
        expect(firstUpload.isDuplicate).toBe(false);

        // Second upload of the same file
        const secondUpload = await googleDriveService.uploadBackup(local.filePath, local.fileName);
        expect(secondUpload.isDuplicate).toBe(true);
        expect(secondUpload.fileId).toBe(firstUpload.fileId);
      } finally {
        try { fs.unlinkSync(local.filePath); } catch {}
      }
    });

    it('Scenario E (Cloud): strictly retains latest 7 cloud backups and deletes older files', async () => {
      mockRemoteFiles = [];
      // Populate 9 files
      for (let i = 0; i < 9; i++) {
        mockRemoteFiles.push({
          id: `file-${i}`,
          name: `mishkat_backup_2026-09-${String(10 + i).padStart(2, '0')}.json`,
          size: '1024',
          createdTime: new Date(Date.now() - (10 - i) * 60_000).toISOString(),
        });
      }

      expect(mockRemoteFiles.length).toBe(9);

      // Prune cloud backups
      const deletedCount = await googleDriveService.pruneCloudBackups(mockDrive, 'mock-folder-id-123');

      expect(deletedCount).toBe(2);
      expect(mockRemoteFiles.length).toBe(CLOUD_BACKUP_RETENTION_LIMIT);
      expect(mockRemoteFiles.length).toBe(7);
    });

    it('Scenario B: if Google Drive upload fails, local backup is preserved and cloud marked waiting', async () => {
      // Temporarily mock upload to throw network error
      const originalCreate = mockDrive.files.create;
      mockDrive.files.create = vi.fn().mockImplementation(async ({ media }: any) => {
        if (media && media.body) {
          media.body.on('error', () => {});
          if (typeof media.body.destroy === 'function') media.body.destroy();
        }
        throw new Error('Network error: ETIMEDOUT connect to Google');
      });

      try {
        const cycle = await backupScheduler.runBackupCycle('Scheduler Tester');

        // Local backup must be SUCCESSFUL
        expect(cycle.localSuccess).toBe(true);
        expect(cycle.fileName).toBeDefined();

        // Cloud upload must be marked waiting / not successful
        expect(cycle.cloudSuccess).toBe(false);
        expect(cycle.cloudStatus).toBe('waiting');

        // Local file must exist on disk!
        const localPath = path.join(serverConfig.dirs.backups, cycle.fileName!);
        expect(fs.existsSync(localPath)).toBe(true);

        // Clean up
        try { fs.unlinkSync(localPath); } catch {}
      } finally {
        mockDrive.files.create = originalCreate;
      }
    });

    it('Scenario F & G: downloads and restores from Google Drive backup with ACID rollback protection', async () => {
      const res = await request(app)
        .post('/api/v1/backups/drive/mock-file-id-for-restore/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.preRestoreBackup).toBeDefined();
      expect(res.body.data.message).toContain('تم استرجاع قاعدة البيانات المركزية بنجاح من Google Drive');

      // Clean up pre-restore backup created
      const safetyPath = path.join(serverConfig.dirs.backups, res.body.data.preRestoreBackup);
      try { fs.unlinkSync(safetyPath); } catch {}
    });
  });

  describe('3. Admin Status Endpoints & RBAC Protection', () => {
    it('GET /api/v1/backups/status returns comprehensive local and cloud status', async () => {
      const res = await request(app)
        .get('/api/v1/backups/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.local).toBeDefined();
      expect(res.body.data.local.maxRetention).toBe(7);
      expect(res.body.data.cloud).toBeDefined();
      expect(res.body.data.cloud.maxRetention).toBe(7);
    });

    it('enforces RBAC: students cannot access status or Google Drive management routes', async () => {
      const statusRes = await request(app)
        .get('/api/v1/backups/status')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(statusRes.status).toBe(403);

      const driveListRes = await request(app)
        .get('/api/v1/backups/drive/backups')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(driveListRes.status).toBe(403);

      const restoreDriveRes = await request(app)
        .post('/api/v1/backups/drive/file-123/restore')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ confirm: true });
      expect(restoreDriveRes.status).toBe(403);
    });
  });

  describe('4. Dual-Layer Token Persistence, Auto-Healing Across Updates & Dedicated Folder Organization', () => {
    it('persists tokens to PostgreSQL system_settings and restores them when secrets file is removed (update simulation)', async () => {
      // 1. Ensure tokens are saved
      const testTokens = {
        access_token: 'test-access-token-persistent',
        refresh_token: 'test-refresh-token-vital-across-updates',
        token_type: 'Bearer',
        expiry_date: Date.now() + 7200_000,
      };
      await googleDriveService.saveTokens(testTokens);

      // Verify stored in PostgreSQL system_settings
      const dbRow = await db.query("SELECT value FROM system_settings WHERE key = 'google_drive_tokens'");
      expect(dbRow.rows.length).toBe(1);
      const parsedFromDb = typeof dbRow.rows[0].value === 'string' ? JSON.parse(dbRow.rows[0].value) : dbRow.rows[0].value;
      expect(parsedFromDb.refresh_token).toBe('test-refresh-token-vital-across-updates');

      // 2. Simulate application update / secrets directory wipe:
      // Delete the secrets file on disk
      const secretsTokensPath = path.join(serverConfig.dirs.secrets, 'google_drive_tokens.json');
      if (fs.existsSync(secretsTokensPath)) {
        fs.unlinkSync(secretsTokensPath);
      }
      expect(fs.existsSync(secretsTokensPath)).toBe(false);

      // 3. Call syncTokensWithDb (as executed on server startup in index.ts)
      await googleDriveService.syncTokensWithDb();

      // 4. File must be re-created from database
      expect(fs.existsSync(secretsTokensPath)).toBe(true);
      const restoredFileTokens = JSON.parse(fs.readFileSync(secretsTokensPath, 'utf8'));
      expect(restoredFileTokens.refresh_token).toBe('test-refresh-token-vital-across-updates');
      expect(googleDriveService.getTokens()?.refresh_token).toBe('test-refresh-token-vital-across-updates');
    });

    it('merges tokens so refreshing access token does not destroy the long-lived refresh_token', async () => {
      // Save tokens with refresh_token
      await googleDriveService.saveTokens({
        access_token: 'initial-access-token',
        refresh_token: 'initial-refresh-token-must-stay',
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600_000,
      });

      // Now Google OAuth token refresh response returns ONLY an access_token (without refresh_token)
      await googleDriveService.saveTokens({
        access_token: 'refreshed-short-lived-access-token',
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600_000,
      } as any);

      // Verify refresh_token was NOT lost in DB or file
      const current = googleDriveService.getTokens();
      expect(current?.access_token).toBe('refreshed-short-lived-access-token');
      expect(current?.refresh_token).toBe('initial-refresh-token-must-stay');
    });

    it('organizes loose root backups into dedicated "MISHKAT Backups" folder', async () => {
      // Prepare simulated loose backup files located in root (parents: ['root'])
      mockRemoteFiles = [
        { id: 'loose-1', name: 'mishkat_backup_old1.json', size: '1024', createdTime: new Date().toISOString() },
        { id: 'loose-2', name: 'mishkat_backup_old2.json', size: '2048', createdTime: new Date().toISOString() },
      ];

      const organizedCount = await googleDriveService.organizeLooseBackups(mockDrive, 'mock-folder-id-123');
      expect(organizedCount).toBe(2);
      expect((mockRemoteFiles[0] as any).parents).toEqual(['mock-folder-id-123']);
      expect((mockRemoteFiles[1] as any).parents).toEqual(['mock-folder-id-123']);
    });

    it('GET /api/v1/backups/status exposes folderId and folderName for UI deep linking', async () => {
      // Ensure folder is set in config
      await googleDriveService.saveConfig({
        clientId: 'mock-client-id-12345',
        clientSecret: 'mock-client-secret-67890',
        folderId: 'folder-abc-987',
        folderName: 'MISHKAT Backups',
      });

      const res = await request(app)
        .get('/api/v1/backups/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.cloud.folderId).toBe('folder-abc-987');
      expect(res.body.data.cloud.folderName).toBe('MISHKAT Backups');
    });
  });

  afterAll(() => {
    googleDriveService.setMockDriveClient(null);
    googleDriveService.disconnect();
  });
});
