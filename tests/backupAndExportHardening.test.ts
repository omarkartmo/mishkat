import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Express } from 'express';
import { createExpressApp } from '../server/index';
import { db } from '../server/db/pool';
import { serverConfig } from '../server/config';
import {
  createDatabaseBackup,
  setRestoreTestFailureHook,
  validateBackupPayload,
  parseAndDecryptBackup,
} from '../server/services/backupService';
import {
  encryptBackupPayload,
  decryptBackupEnvelope,
  isEncryptedBackupEnvelope,
} from '../server/services/backupCrypto';

let app: Express;
let adminToken: string;
let studentToken: string;

beforeAll(async () => {
  app = await createExpressApp();

  // Admin login
  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'ADM-001', password: 'admin123' });
  adminToken = adminLogin.body.data.token;

  // Student login
  const studentLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ registrationNumber: 'STU-2026-101', password: '123456' });
  studentToken = studentLogin.body.data.token;
});

describe('MISHKAT: Hardened Backup, Restore & Data Export Security Suite', () => {
  let createdBackupFileName = '';

  describe('1. Unencrypted Authoritative Backup Creation & RBAC', () => {
    it('creates a standard unencrypted, validated backup file on disk without requiring keys', async () => {
      const res = await request(app)
        .post('/api/v1/backups/create')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fileName).toBeDefined();
      expect(res.body.data.tablesCount).toBe(16);

      createdBackupFileName = res.body.data.fileName;
      const backupPath = path.join(serverConfig.dirs.backups, createdBackupFileName);
      expect(fs.existsSync(backupPath)).toBe(true);

      const rawContent = fs.readFileSync(backupPath, 'utf8');
      const parsedBackup = JSON.parse(rawContent);

      // Verify standard plain JSON structure (No AES-256-GCM, no ciphertext)
      expect(parsedBackup.meta).toBeDefined();
      expect(parsedBackup.meta.version).toBe('1.0.0');
      expect(parsedBackup.meta.application).toBe('MISHKAT');
      expect(parsedBackup.data).toBeDefined();
      expect(parsedBackup.data.users).toBeInstanceOf(Array);
      expect(parsedBackup.data.books).toBeInstanceOf(Array);
      expect(parsedBackup.ciphertext).toBeUndefined();
      expect(parsedBackup.authTag).toBeUndefined();
    });

    it('enforces RBAC: students and unauthenticated users cannot create backups', async () => {
      const unauthRes = await request(app).post('/api/v1/backups/create');
      expect(unauthRes.status).toBe(401);

      const studentRes = await request(app)
        .post('/api/v1/backups/create')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(studentRes.status).toBe(403);
    });
  });

  describe('2. Legacy Encrypted Backup Backward Compatibility & Tamper Detection', () => {
    let legacyEncryptedFileName = '';

    beforeAll(() => {
      // Create a valid legacy encrypted envelope using encryptBackupPayload to test backward compatibility
      const { data } = parseAndDecryptBackup(fs.readFileSync(path.join(serverConfig.dirs.backups, createdBackupFileName), 'utf8'));
      const envelope = encryptBackupPayload(data, {
        exportedAt: new Date().toISOString(),
        exportedBy: 'Legacy Admin',
        version: '2.0.0',
        application: 'MISHKAT',
        type: 'manual',
        tablesCount: 16,
      });

      legacyEncryptedFileName = `legacy_encrypted_${Date.now()}.json`;
      fs.writeFileSync(
        path.join(serverConfig.dirs.backups, legacyEncryptedFileName),
        JSON.stringify(envelope, null, 2),
        'utf8'
      );
    });

    afterAll(() => {
      if (legacyEncryptedFileName) {
        try { fs.unlinkSync(path.join(serverConfig.dirs.backups, legacyEncryptedFileName)); } catch {}
      }
    });

    it('successfully parses and decrypts a legacy encrypted envelope', () => {
      const backupPath = path.join(serverConfig.dirs.backups, legacyEncryptedFileName);
      const rawContent = fs.readFileSync(backupPath, 'utf8');
      const decrypted = parseAndDecryptBackup(rawContent);

      expect(decrypted.isEncrypted).toBe(true);
      expect(decrypted.data.data.users).toBeInstanceOf(Array);
      expect(decrypted.data.data.users.length).toBeGreaterThan(0);
      expect(decrypted.data.data.books).toBeInstanceOf(Array);
    });

    it('detects and rejects tampered ciphertext in legacy envelope via authTag verification failure', async () => {
      const backupPath = path.join(serverConfig.dirs.backups, legacyEncryptedFileName);
      const rawContent = fs.readFileSync(backupPath, 'utf8');
      const envelope = JSON.parse(rawContent);

      // Tamper with ciphertext by altering characters
      const originalCiphertext = envelope.ciphertext;
      const tamperedCiphertext =
        originalCiphertext.slice(0, 10) +
        (originalCiphertext[10] === 'A' ? 'B' : 'A') +
        originalCiphertext.slice(11);
      envelope.ciphertext = tamperedCiphertext;

      const tamperedFileName = `tampered_${Date.now()}.json`;
      const tamperedPath = path.join(serverConfig.dirs.backups, tamperedFileName);
      fs.writeFileSync(tamperedPath, JSON.stringify(envelope), 'utf8');

      try {
        const res = await request(app)
          .post(`/api/v1/backups/${tamperedFileName}/restore`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ confirm: true });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_BACKUP_TAMPERED');
        expect(res.body.error.message).toContain('Authentication Tag Mismatch');
      } finally {
        try { fs.unlinkSync(tamperedPath); } catch {}
      }
    });
  });

  describe('3. Atomic ACID Restore & Rollback', () => {
    it('restores database completely from plain backup and creates pre-restore safety backup', async () => {
      const res = await request(app)
        .post(`/api/v1/backups/${createdBackupFileName}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isEncrypted).toBe(false);
      expect(res.body.data.preRestoreBackup).toBeDefined();

      const preRestorePath = path.join(serverConfig.dirs.backups, res.body.data.preRestoreBackup);
      expect(fs.existsSync(preRestorePath)).toBe(true);

      // Clean up safety backup after test
      try { fs.unlinkSync(preRestorePath); } catch {}
    });

    it('rolls back completely if a failure occurs mid-transaction', async () => {
      const { rows: preUsers } = await db.query('SELECT id, name FROM users ORDER BY id');

      setRestoreTestFailureHook((stage) => {
        if (stage === 'mid_insert') {
          throw new Error('SIMULATED_TEST_CRASH_MID_RESTORE');
        }
      });

      try {
        const res = await request(app)
          .post(`/api/v1/backups/${createdBackupFileName}/restore`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ confirm: true });

        expect(res.status).toBe(500);
        expect(res.body.error.code).toBe('RESTORE_FAILED');

        const { rows: postUsers } = await db.query('SELECT id, name FROM users ORDER BY id');
        expect(postUsers).toEqual(preUsers);
      } finally {
        setRestoreTestFailureHook(null);
      }
    });
  });

  describe('4. Staging Queue Truncation & Restore', () => {
    it('clears staging_queue on restore and does not leave orphaned records', async () => {
      // 1. Insert a temporary staging item
      const testSqId = `test-sq-${Date.now()}`;
      await db.query(`
        INSERT INTO staging_queue (id, original_filename, staged_file_path, source, format, status)
        VALUES ($1, 'test.pdf', '/tmp/test.pdf', 'test', 'pdf', 'PENDING_REVIEW')
      `, [testSqId]);

      const checkInserted = await db.query('SELECT id FROM staging_queue WHERE id = $1', [testSqId]);
      expect(checkInserted.rows.length).toBe(1);

      // 2. Perform restore from the earlier backup (which did not have testSqId)
      const res = await request(app)
        .post(`/api/v1/backups/${createdBackupFileName}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true });

      expect(res.status).toBe(200);

      // 3. Assert testSqId is completely gone
      const checkGone = await db.query('SELECT id FROM staging_queue WHERE id = $1', [testSqId]);
      expect(checkGone.rows.length).toBe(0);
    });
  });

  describe('5. Backward Compatibility (v1.0.0 Unencrypted Backups)', () => {
    it('accepts and restores legacy unencrypted v1.0.0 backups', async () => {
      // Create a valid legacy v1.0.0 unencrypted backup payload
      const legacyFileName = `legacy_v1_${Date.now()}.json`;
      const legacyPath = path.join(serverConfig.dirs.backups, legacyFileName);

      // Grab current DB tables for valid test payload
      const { rows: users } = await db.query('SELECT * FROM users');
      const { rows: categories } = await db.query('SELECT * FROM categories');
      const { rows: books } = await db.query('SELECT * FROM books');

      const legacyDump = {
        meta: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          exportedBy: 'Legacy Tester',
        },
        data: {
          users,
          categories,
          books,
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

      fs.writeFileSync(legacyPath, JSON.stringify(legacyDump, null, 2), 'utf8');

      try {
        const res = await request(app)
          .post(`/api/v1/backups/${legacyFileName}/restore`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ confirm: true });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.isEncrypted).toBe(false);
      } finally {
        try { fs.unlinkSync(legacyPath); } catch {}
      }
    });

    it('rejects unsupported backup versions', async () => {
      const invalidVersionFileName = `invalid_ver_${Date.now()}.json`;
      const invalidVersionPath = path.join(serverConfig.dirs.backups, invalidVersionFileName);

      fs.writeFileSync(invalidVersionPath, JSON.stringify({
        meta: { version: '99.0.0' },
        data: {},
      }), 'utf8');

      try {
        const res = await request(app)
          .post(`/api/v1/backups/${invalidVersionFileName}/restore`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ confirm: true });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_BACKUP_SCHEMA');
      } finally {
        try { fs.unlinkSync(invalidVersionPath); } catch {}
      }
    });
  });

  describe('6. Institutional Data Export (POST /api/v1/system/export-data)', () => {
    it('enforces RBAC and explicit confirmation for export', async () => {
      // 1. Unauthenticated request -> 401
      const unauth = await request(app).post('/api/v1/system/export-data').send({ confirm: true });
      expect(unauth.status).toBe(401);

      // 2. Student request -> 403
      const studentRes = await request(app)
        .post('/api/v1/system/export-data')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ confirm: true });
      expect(studentRes.status).toBe(403);

      // 3. Admin request without confirm: true -> 400
      const noConfirm = await request(app)
        .post('/api/v1/system/export-data')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(noConfirm.status).toBe(400);
      expect(noConfirm.body.error.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('exports portable unencrypted JSON strictly without passwords or security hashes', async () => {
      const res = await request(app)
        .post('/api/v1/system/export-data')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ confirm: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const exportData = res.body.data;
      expect(exportData.export_version).toBe('1.0.0');
      expect(exportData.application_name).toBe('MISHKAT');
      expect(exportData.exported_by).toBeDefined();
      expect(exportData.exported_by.role).toBe('admin');
      expect(exportData.entities_count).toBeDefined();
      expect(exportData.data).toBeDefined();

      // Ensure data is an unencrypted object
      expect(exportData.data.users).toBeInstanceOf(Array);
      expect(exportData.data.users.length).toBeGreaterThan(0);
      expect(exportData.data.books).toBeInstanceOf(Array);
      expect(exportData.data.categories).toBeInstanceOf(Array);

      // CRITICAL PRIVACY & SECURITY CHECK: verify no user record leaks password or security secrets
      for (const user of exportData.data.users) {
        expect(user.password_hash).toBeUndefined();
        expect(user.security_question).toBeUndefined();
        expect(user.security_answer_hash).toBeUndefined();
        expect(user.token_version).toBeUndefined();
        // Public academic fields must be preserved
        expect(user.id).toBeDefined();
        expect(user.name).toBeDefined();
        expect(user.registration_number).toBeDefined();
      }

      // Verify audit log recorded
      const { rows: auditLogs } = await db.query(
        "SELECT * FROM audit_logs WHERE action = 'EXPORT_INSTITUTIONAL_DATA' ORDER BY created_at DESC LIMIT 1"
      );
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].action).toBe('EXPORT_INSTITUTIONAL_DATA');
    });
  });
});
