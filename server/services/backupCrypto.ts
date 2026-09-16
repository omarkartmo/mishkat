import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { serverConfig } from '../config';
import { logger } from '../utils/logger';

export const BACKUP_ENVELOPE_FORMAT = 'mishkat_encrypted_backup';
export const BACKUP_ENVELOPE_VERSION = '2.0.0';
export const KDF_ALGORITHM = 'pbkdf2-sha256';
export const CIPHER_ALGORITHM = 'aes-256-gcm';
export const PBKDF2_ITERATIONS = 100_000;
export const KEY_LENGTH_BYTES = 32; // 256 bits
export const IV_LENGTH_BYTES = 12;  // 96 bits for GCM
export const SALT_LENGTH_BYTES = 16;
export const AUTH_TAG_LENGTH_BYTES = 16;

export interface EncryptedBackupEnvelope {
  format: typeof BACKUP_ENVELOPE_FORMAT;
  version: typeof BACKUP_ENVELOPE_VERSION;
  algorithm: typeof CIPHER_ALGORITHM;
  kdf: typeof KDF_ALGORITHM;
  salt: string;      // hex
  iv: string;        // hex
  authTag: string;   // hex
  sha256: string;    // hex of unencrypted utf-8 plaintext
  meta: {
    exportedAt: string;
    exportedBy: string;
    version: string;
    application: string;
    type: 'manual' | 'pre_restore';
    tablesCount: number;
    [key: string]: any;
  };
  ciphertext: string; // base64
}

/**
 * Gets or initializes the master backup encryption secret from:
 * 1. BACKUP_ENCRYPTION_KEY environment variable if defined and non-empty.
 * 2. Secrets file at LibraryData/secrets/backup.key.
 * 3. Otherwise generates a cryptographically secure 256-bit random key and persists it.
 */
export function getOrCreateMasterBackupKey(): string {
  const envKey = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (envKey && envKey.length >= 16) {
    return envKey;
  }

  const secretsDir = serverConfig.dirs.secrets;
  const keyFilePath = path.join(secretsDir, 'backup.key');

  try {
    if (!fs.existsSync(secretsDir)) {
      fs.mkdirSync(secretsDir, { recursive: true });
    }

    if (fs.existsSync(keyFilePath)) {
      const savedKey = fs.readFileSync(keyFilePath, 'utf8').trim();
      if (savedKey.length >= 32) {
        return savedKey;
      }
    }

    // Generate new secure 256-bit random key in hex format
    const generatedKey = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(keyFilePath, generatedKey, { encoding: 'utf8', mode: 0o600 });
      logger.info('[BackupCrypto] Generated and secured new master backup key.');
    } catch (writeErr: any) {
      // If filesystem permissions fail (e.g. Windows mode flag quirks), fallback to plain write
      fs.writeFileSync(keyFilePath, generatedKey, 'utf8');
    }
    return generatedKey;
  } catch (err: any) {
    logger.error('[BackupCrypto] Failed to read or generate backup.key:', err.message);
    // Ultimate fallback to deterministic machine/server secret derivation if disk write fails
    return crypto.createHash('sha256').update(serverConfig.jwtSecret + '::mishkat_backup_fallback_salt').digest('hex');
  }
}

/**
 * Derives a 256-bit key from passphrase/master key and salt using PBKDF2-HMAC-SHA256
 */
export function deriveKey(masterSecret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    masterSecret,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH_BYTES,
    'sha256'
  );
}

/**
 * Encrypts arbitrary data (string or object) into a self-contained, authenticated envelope.
 */
export function encryptBackupPayload(
  payload: any,
  meta: EncryptedBackupEnvelope['meta'],
  customPassphrase?: string
): EncryptedBackupEnvelope {
  const masterSecret = customPassphrase || getOrCreateMasterBackupKey();
  const plaintext = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const plaintextBuffer = Buffer.from(plaintext, 'utf8');

  // Compute SHA-256 digest of original plaintext for secondary integrity assertion
  const sha256Digest = crypto.createHash('sha256').update(plaintextBuffer).digest('hex');

  const salt = crypto.randomBytes(SALT_LENGTH_BYTES);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const derivedKey = deriveKey(masterSecret, salt);

  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  const ciphertextBuffer = Buffer.concat([
    cipher.update(plaintextBuffer),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    format: BACKUP_ENVELOPE_FORMAT,
    version: BACKUP_ENVELOPE_VERSION,
    algorithm: CIPHER_ALGORITHM,
    kdf: KDF_ALGORITHM,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    sha256: sha256Digest,
    meta,
    ciphertext: ciphertextBuffer.toString('base64'),
  };
}

/**
 * Decrypts and verifies an authenticated backup envelope.
 * Throws descriptive errors if tampered, corrupted, or invalid key is supplied.
 */
export function decryptBackupEnvelope<T = any>(
  envelope: EncryptedBackupEnvelope,
  customPassphrase?: string
): { meta: EncryptedBackupEnvelope['meta']; data: T } {
  if (!isEncryptedBackupEnvelope(envelope)) {
    throw new Error('الملف ليس غلاف نسخة احتياطية مشفرة متوافق مع نظام مشكاة.');
  }

  if (envelope.algorithm !== CIPHER_ALGORITHM) {
    throw new Error(`خوارزمية التشفير (${envelope.algorithm}) غير مدعومة.`);
  }

  const masterSecret = customPassphrase || getOrCreateMasterBackupKey();
  const salt = Buffer.from(envelope.salt, 'hex');
  const iv = Buffer.from(envelope.iv, 'hex');
  const authTag = Buffer.from(envelope.authTag, 'hex');
  const ciphertextBuffer = Buffer.from(envelope.ciphertext, 'base64');

  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error('توقيع المصادقة الأمني (authTag) تالف أو غير مكتمل.');
  }

  const derivedKey = deriveKey(masterSecret, salt);

  const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  decipher.setAuthTag(authTag);

  let decryptedBuffer: Buffer;
  try {
    decryptedBuffer = Buffer.concat([
      decipher.update(ciphertextBuffer),
      decipher.final(),
    ]);
  } catch (decipherErr: any) {
    throw new Error(
      'فشل التحقق من صحة ومصادقة النسخة الاحتياطية (Authentication Tag Mismatch). تم التلاعب بالبيانات أو المفتاح السري غير صحيح.'
    );
  }

  // Verify SHA-256 digest of decrypted buffer against envelope's recorded hash
  const computedSha256 = crypto.createHash('sha256').update(decryptedBuffer).digest('hex');
  if (computedSha256 !== envelope.sha256) {
    throw new Error('فشل فحص سلامة البيانات: تجزئة SHA-256 للمحتوى لا تطابق التجزئة المعتمدة في غلاف النسخة.');
  }

  const plaintext = decryptedBuffer.toString('utf8');
  let parsedPayload: T;
  try {
    parsedPayload = JSON.parse(plaintext);
  } catch (jsonErr: any) {
    throw new Error('فشل قراءة محتوى النسخة المفكوك تشفيره: محتوى JSON تالف.');
  }

  return {
    meta: envelope.meta,
    data: parsedPayload,
  };
}

/**
 * Checks whether an object matches the encrypted backup envelope format.
 */
export function isEncryptedBackupEnvelope(data: any): data is EncryptedBackupEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    data.format === BACKUP_ENVELOPE_FORMAT &&
    typeof data.ciphertext === 'string' &&
    typeof data.authTag === 'string' &&
    typeof data.iv === 'string' &&
    typeof data.salt === 'string' &&
    typeof data.sha256 === 'string'
  );
}
