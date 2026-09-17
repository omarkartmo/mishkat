import fs from 'fs';
import path from 'path';
import { google, drive_v3 } from 'googleapis';
import { serverConfig } from '../config';
import { logger } from '../utils/logger';

export const CLOUD_BACKUP_RETENTION_LIMIT = 7;
export const DRIVE_BACKUPS_FOLDER_NAME = 'MISHKAT Backups';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleDriveTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
}

export interface CloudBackupItem {
  id: string;
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
}

export interface DriveConnectionStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  folderId?: string;
  error?: string;
}

class GoogleDriveService {
  private configFilePath: string;
  private tokensFilePath: string;
  private customDriveClient: drive_v3.Drive | null = null;

  constructor() {
    this.configFilePath = path.join(serverConfig.dirs.secrets, 'google_drive_config.json');
    this.tokensFilePath = path.join(serverConfig.dirs.secrets, 'google_drive_tokens.json');
  }

  /**
   * For unit/integration testing: inject a custom Drive client instance.
   */
  public setMockDriveClient(mock: drive_v3.Drive | null): void {
    this.customDriveClient = mock;
  }

  /**
   * Reads Google OAuth2 client credentials from env or secrets file.
   */
  public getConfig(): GoogleDriveConfig {
    const envClientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const envClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const envRedirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();

    if (envClientId && envClientSecret) {
      return {
        clientId: envClientId,
        clientSecret: envClientSecret,
        redirectUri: envRedirectUri || `http://localhost:${serverConfig.port}/api/v1/backups/drive/callback`,
      };
    }

    if (fs.existsSync(this.configFilePath)) {
      try {
        const fileContent = fs.readFileSync(this.configFilePath, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed.clientId && parsed.clientSecret) {
          return {
            clientId: parsed.clientId,
            clientSecret: parsed.clientSecret,
            redirectUri: parsed.redirectUri || `http://localhost:${serverConfig.port}/api/v1/backups/drive/callback`,
          };
        }
      } catch (err: any) {
        logger.warn(`[GoogleDrive] Failed to read config file: ${err.message}`);
      }
    }

    return {
      clientId: envClientId || '',
      clientSecret: envClientSecret || '',
      redirectUri: `http://localhost:${serverConfig.port}/api/v1/backups/drive/callback`,
    };
  }

  /**
   * Saves OAuth configuration entered by the administrator.
   */
  public saveConfig(config: Partial<GoogleDriveConfig>): void {
    const current = this.getConfig();
    const updated: GoogleDriveConfig = {
      clientId: config.clientId?.trim() || current.clientId,
      clientSecret: config.clientSecret?.trim() || current.clientSecret,
      redirectUri: config.redirectUri?.trim() || current.redirectUri,
    };

    if (!fs.existsSync(serverConfig.dirs.secrets)) {
      fs.mkdirSync(serverConfig.dirs.secrets, { recursive: true });
    }

    fs.writeFileSync(this.configFilePath, JSON.stringify(updated, null, 2), 'utf8');
    logger.info('[GoogleDrive] Saved OAuth configuration.');
  }

  public isConfigured(): boolean {
    const config = this.getConfig();
    return Boolean(config.clientId && config.clientSecret);
  }

  /**
   * Loads saved tokens from disk.
   */
  public getTokens(): GoogleDriveTokens | null {
    if (!fs.existsSync(this.tokensFilePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(this.tokensFilePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Saves updated tokens to disk.
   */
  public saveTokens(tokens: GoogleDriveTokens): void {
    if (!fs.existsSync(serverConfig.dirs.secrets)) {
      fs.mkdirSync(serverConfig.dirs.secrets, { recursive: true });
    }
    fs.writeFileSync(this.tokensFilePath, JSON.stringify(tokens, null, 2), 'utf8');
  }

  /**
   * Clears saved tokens (disconnect).
   */
  public disconnect(): void {
    if (fs.existsSync(this.tokensFilePath)) {
      try {
        fs.unlinkSync(this.tokensFilePath);
      } catch {}
    }
    logger.info('[GoogleDrive] Disconnected Google Drive and removed tokens.');
  }

  /**
   * Creates an OAuth2 client instance.
   */
  public createOAuth2Client(redirectUriOverride?: string) {
    const config = this.getConfig();
    const redirectUri = redirectUriOverride || config.redirectUri;
    return new google.auth.OAuth2(config.clientId, config.clientSecret, redirectUri);
  }

  /**
   * Generates authorization URL for the user to log into Google.
   */
  public getAuthUrl(redirectUriOverride?: string): string {
    const oauth2Client = this.createOAuth2Client(redirectUriOverride);
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [DRIVE_FILE_SCOPE, 'https://www.googleapis.com/auth/userinfo.email'],
      prompt: 'consent',
    });
  }

  /**
   * Exchanges authorization code for tokens and saves them.
   */
  public async exchangeCodeForTokens(code: string, redirectUriOverride?: string): Promise<GoogleDriveTokens> {
    const oauth2Client = this.createOAuth2Client(redirectUriOverride);
    const { tokens } = await oauth2Client.getToken(code);
    this.saveTokens(tokens);
    logger.info('[GoogleDrive] Successfully exchanged code and stored Google Drive tokens.');
    return tokens;
  }

  /**
   * Gets an authenticated Google Drive client instance.
   */
  public async getDriveClient(): Promise<drive_v3.Drive> {
    if (this.customDriveClient) {
      return this.customDriveClient;
    }

    const tokens = this.getTokens();
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      throw new Error('Google Drive غير متصل. يرجى تسجيل الدخول وربط الحساب أولاً.');
    }

    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials(tokens);

    // Persist refreshed tokens automatically
    oauth2Client.on('tokens', (refreshedTokens) => {
      const merged = { ...this.getTokens(), ...refreshedTokens };
      this.saveTokens(merged);
      logger.info('[GoogleDrive] Automatically refreshed and saved Google Drive tokens.');
    });

    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Checks current connection status with Google Drive.
   */
  public async getConnectionStatus(): Promise<DriveConnectionStatus> {
    const configured = this.isConfigured();
    const tokens = this.getTokens();

    if (!configured) {
      return { configured: false, connected: false };
    }

    if (!tokens) {
      return { configured: true, connected: false };
    }

    try {
      const drive = await this.getDriveClient();
      const folderId = await this.ensureBackupsFolder(drive);
      return {
        configured: true,
        connected: true,
        folderId,
      };
    } catch (err: any) {
      return {
        configured: true,
        connected: false,
        error: err.message,
      };
    }
  }

  /**
   * Finds or creates the dedicated "MISHKAT Backups" folder on Google Drive.
   */
  public async ensureBackupsFolder(drive?: drive_v3.Drive): Promise<string> {
    const driveClient = drive || (await this.getDriveClient());

    const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${DRIVE_BACKUPS_FOLDER_NAME}' and trashed = false`;
    const res = await driveClient.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id!;
    }

    // Create the folder if it does not exist
    const createRes = await driveClient.files.create({
      requestBody: {
        name: DRIVE_BACKUPS_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id, name',
    });

    if (!createRes.data.id) {
      throw new Error('فشل إنشاء مجلد النسخ الاحتياطية على Google Drive.');
    }

    logger.info(`[GoogleDrive] Created folder "${DRIVE_BACKUPS_FOLDER_NAME}" with ID: ${createRes.data.id}`);
    return createRes.data.id;
  }

  /**
   * Uploads a local backup file to Google Drive:
   * 1. Checks if the file already exists in "MISHKAT Backups" folder (Prevent Duplicate Uploads).
   * 2. Uploads file stream.
   * 3. Enforces cloud retention: keeps latest 7 backups, deletes oldest.
   */
  public async uploadBackup(
    filePath: string,
    fileName: string
  ): Promise<{ fileId: string; fileName: string; isDuplicate: boolean }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`ملف النسخة الاحتياطية غير موجود محلياً: ${filePath}`);
    }

    const drive = await this.getDriveClient();
    const folderId = await this.ensureBackupsFolder(drive);

    // 1. Prevent duplicate uploads: check if file with this exact name already exists
    const duplicateCheck = await drive.files.list({
      q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (duplicateCheck.data.files && duplicateCheck.data.files.length > 0) {
      const existing = duplicateCheck.data.files[0];
      logger.info(`[GoogleDrive] File "${fileName}" already exists on Google Drive (${existing.id}). Skipping upload.`);
      return {
        fileId: existing.id!,
        fileName,
        isDuplicate: true,
      };
    }

    // 2. Upload the file to Google Drive
    const fileSize = fs.statSync(filePath).size;
    const readStream = fs.createReadStream(filePath);
    readStream.on('error', (err) => {
      logger.warn(`[GoogleDrive] Backup read stream notice: ${err.message}`);
    });

    const media = {
      mimeType: 'application/json',
      body: readStream,
    };

    let uploadRes;
    try {
      uploadRes = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
          description: 'MISHKAT Institutional Database Backup',
        },
        media,
        fields: 'id, name',
      });
    } catch (uploadErr) {
      if (typeof readStream.destroy === 'function') {
        readStream.destroy();
      }
      throw uploadErr;
    }

    const newFileId = uploadRes.data.id;
    if (!newFileId) {
      throw new Error('فشل رفع النسخة الاحتياطية إلى Google Drive.');
    }

    logger.info(`[GoogleDrive] Backup "${fileName}" uploaded successfully. File ID: ${newFileId}`);

    // 3. Enforce Cloud Retention = Keep latest 7 backups
    await this.pruneCloudBackups(drive, folderId);

    return {
      fileId: newFileId,
      fileName,
      isDuplicate: false,
    };
  }

  /**
   * Prunes older backups on Google Drive, strictly keeping the latest 7.
   */
  public async pruneCloudBackups(drive?: drive_v3.Drive, folderId?: string): Promise<number> {
    try {
      const driveClient = drive || (await this.getDriveClient());
      const parentId = folderId || (await this.ensureBackupsFolder(driveClient));

      const listRes = await driveClient.files.list({
        q: `'${parentId}' in parents and trashed = false`,
        fields: 'files(id, name, createdTime)',
        orderBy: 'createdTime desc',
        pageSize: 50,
      });

      const files = listRes.data.files || [];
      if (files.length <= CLOUD_BACKUP_RETENTION_LIMIT) {
        return 0;
      }

      let deletedCount = 0;
      // Delete the oldest files beyond the retention limit
      for (let i = CLOUD_BACKUP_RETENTION_LIMIT; i < files.length; i++) {
        const fileToDelete = files[i];
        if (fileToDelete.id) {
          try {
            await driveClient.files.delete({ fileId: fileToDelete.id });
            deletedCount++;
            logger.info(`[GoogleDrive] Deleted old cloud backup to enforce retention: ${fileToDelete.name} (${fileToDelete.id})`);
          } catch (delErr: any) {
            logger.warn(`[GoogleDrive] Failed to delete old cloud backup: ${delErr.message}`);
          }
        }
      }

      return deletedCount;
    } catch (err: any) {
      logger.warn(`[GoogleDrive] Cloud backup pruning failed: ${err.message}`);
      return 0;
    }
  }

  /**
   * Lists available backups stored in the "MISHKAT Backups" folder on Google Drive.
   */
  public async listCloudBackups(): Promise<CloudBackupItem[]> {
    const drive = await this.getDriveClient();
    const folderId = await this.ensureBackupsFolder(drive);

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, size, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 50,
    });

    const files = res.data.files || [];
    return files.map((f) => {
      const sizeBytes = parseInt(f.size || '0', 10);
      return {
        id: f.id!,
        name: f.name || 'unnamed_backup.json',
        sizeBytes,
        sizeFormatted: `${(sizeBytes / 1024).toFixed(1)} KB`,
        createdAt: f.createdTime || new Date().toISOString(),
      };
    });
  }

  /**
   * Downloads a backup file from Google Drive to a local target file path.
   */
  public async downloadCloudBackup(fileId: string, destPath: string): Promise<void> {
    const drive = await this.getDriveClient();
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    await new Promise<void>((resolve, reject) => {
      const destStream = fs.createWriteStream(destPath);
      res.data
        .on('error', (err: any) => {
          destStream.close();
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        })
        .pipe(destStream)
        .on('finish', () => {
          resolve();
        })
        .on('error', (err: any) => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
    });
  }
}

export const googleDriveService = new GoogleDriveService();
