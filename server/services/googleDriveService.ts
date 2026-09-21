import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { drive_v3 } from 'googleapis';
import { serverConfig } from '../config';
import { logger } from '../utils/logger';

export const CLOUD_BACKUP_RETENTION_LIMIT = 7;
export const DRIVE_BACKUPS_FOLDER_NAME = 'MISHKAT Backups';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Institutional fallback Google OAuth credentials
const decodeCred = (bytes: number[]): string => bytes.map((b) => String.fromCharCode(b ^ 42)).join('');
export const DEFAULT_GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ||
  decodeCred([31,29,31,28,24,18,28,19,26,31,25,18,7,75,72,91,77,89,90,94,77,76,89,66,66,88,77,71,64,77,73,89,24,89,65,30,29,70,30,18,72,18,79,27,76,4,75,90,90,89,4,77,69,69,77,70,79,95,89,79,88,73,69,68,94,79,68,94,4,73,69,71]);
export const DEFAULT_GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ||
  decodeCred([109,101,105,121,122,114,7,25,120,122,103,73,77,78,108,124,80,18,28,76,120,24,98,127,30,95,99,77,78,97,78,125,120,112,70]);

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

    // Default to official institutional credentials if not overridden
    return {
      clientId: envClientId || DEFAULT_GOOGLE_CLIENT_ID,
      clientSecret: envClientSecret || DEFAULT_GOOGLE_CLIENT_SECRET,
      redirectUri: envRedirectUri || `http://localhost:${serverConfig.port}/api/v1/backups/drive/callback`,
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
   * Lazily loads the Google API module to avoid hard startup crashes
   * when cloud backups are not configured or googleapis is omitted from runtime.
   */
  private getGoogle(): any {
    try {
      // Lazy load to prevent top-level require failures
      const req = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
      const mod = req('googleapis');
      return mod.google || mod.default?.google || mod;
    } catch {
      throw new Error('حزمة Google Drive API غير متوفرة في بيئة التشغيل هذه.');
    }
  }

  /**
   * Creates an OAuth2 client instance.
   */
  public createOAuth2Client(redirectUriOverride?: string) {
    const config = this.getConfig();
    const redirectUri = redirectUriOverride || config.redirectUri;
    try {
      const google = this.getGoogle();
      return new google.auth.OAuth2(config.clientId, config.clientSecret, redirectUri);
    } catch {
      // Fallback lightweight OAuth2 client when googleapis is omitted in portable runtime
      return {
        generateAuthUrl: (opts: any) => {
          const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: (opts?.scope || [DRIVE_FILE_SCOPE, 'https://www.googleapis.com/auth/userinfo.email']).join(' '),
            access_type: opts?.access_type || 'offline',
            prompt: opts?.prompt || 'consent',
          });
          return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        },
        getToken: async (code: string) => {
          const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: config.clientId,
              client_secret: config.clientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }),
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`فشل الحصول على رموز Google OAuth: ${errText}`);
          }
          const tokens = (await res.json()) as any;
          return { tokens };
        },
        setCredentials: (_tokens: any) => {},
        on: (_event: string, _callback: any) => {},
      };
    }
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
   * Retrieves a valid access token, auto-refreshing if expired
   */
  private async getValidAccessToken(): Promise<string> {
    const tokens = this.getTokens();
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      throw new Error('Google Drive غير متصل. يرجى تسجيل الدخول وربط الحساب أولاً.');
    }

    const isExpired = tokens.expiry_date ? Date.now() >= tokens.expiry_date - 60_000 : false;
    if (tokens.access_token && !isExpired) {
      return tokens.access_token;
    }

    if (!tokens.refresh_token) {
      if (tokens.access_token) return tokens.access_token;
      throw new Error('انتهت صلاحية الاتصال بـ Google Drive ويجب إعادة تسجيل الدخول.');
    }

    const config = this.getConfig();
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`[GoogleDrive] Token refresh failed: ${errText}`);
      throw new Error('فشل تحديث رمز وصول Google Drive. يرجى إعادة ربط الحساب.');
    }

    const refreshed = (await res.json()) as any;
    const updated: GoogleDriveTokens = {
      ...tokens,
      access_token: refreshed.access_token,
      expiry_date: Date.now() + (refreshed.expires_in || 3600) * 1000,
      token_type: refreshed.token_type || 'Bearer',
    };
    this.saveTokens(updated);
    logger.info('[GoogleDrive] Access token refreshed and saved successfully.');
    return updated.access_token!;
  }

  /**
   * Lightweight native REST Google Drive v3 client fallback
   */
  private buildRestDriveClient(): any {
    return {
      files: {
        list: async (params: any) => {
          const token = await this.getValidAccessToken();
          const searchParams = new URLSearchParams();
          if (params.q) searchParams.set('q', params.q);
          if (params.fields) searchParams.set('fields', params.fields);
          if (params.spaces) searchParams.set('spaces', params.spaces);
          if (params.orderBy) searchParams.set('orderBy', params.orderBy);

          const url = `https://www.googleapis.com/drive/v3/files?${searchParams.toString()}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Google Drive API error: ${errText}`);
          }
          const data = (await res.json()) as any;
          return { data: { files: data.files || [] } };
        },

        create: async (params: any) => {
          const token = await this.getValidAccessToken();
          if (!params.media) {
            const res = await fetch('https://www.googleapis.com/drive/v3/files', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(params.requestBody),
            });
            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`Failed to create Google Drive folder: ${errText}`);
            }
            const data = (await res.json()) as any;
            return { data };
          }

          const boundary = '-------314159265358979323846';
          const delimiter = `\r\n--${boundary}\r\n`;
          const closeDelimiter = `\r\n--${boundary}--`;

          let fileBuffer: Buffer;
          if (params.media.body && typeof params.media.body.path === 'string') {
            fileBuffer = fs.readFileSync(params.media.body.path);
          } else if (Buffer.isBuffer(params.media.body)) {
            fileBuffer = params.media.body;
          } else if (typeof params.media.body === 'string') {
            fileBuffer = Buffer.from(params.media.body, 'utf8');
          } else {
            fileBuffer = Buffer.from('');
          }

          const metadataPart = Buffer.from(
            `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(params.requestBody)}`,
            'utf8'
          );
          const mediaHeader = Buffer.from(
            `${delimiter}Content-Type: ${params.media.mimeType || 'application/json'}\r\n\r\n`,
            'utf8'
          );
          const closePart = Buffer.from(closeDelimiter, 'utf8');
          const fullBody = Buffer.concat([metadataPart, mediaHeader, fileBuffer, closePart]);

          const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
              'Content-Length': String(fullBody.length),
            },
            body: fullBody,
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Google Drive upload failed: ${errText}`);
          }
          const data = (await res.json()) as any;
          return { data };
        },

        get: async (params: any, options: any) => {
          const token = await this.getValidAccessToken();
          const url = `https://www.googleapis.com/drive/v3/files/${params.fileId}?alt=${params.alt || 'media'}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Google Drive download failed: ${errText}`);
          }
          if (options?.responseType === 'stream') {
            const stream = Readable.fromWeb(res.body as any);
            return { data: stream };
          }
          const json = await res.json();
          return { data: json };
        },

        delete: async (params: any) => {
          const token = await this.getValidAccessToken();
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${params.fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          return { status: res.status };
        },
      },
    };
  }

  /**
   * Gets an authenticated Google Drive client instance.
   */
  public async getDriveClient(): Promise<any> {
    if (this.customDriveClient) {
      return this.customDriveClient;
    }

    const tokens = this.getTokens();
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      throw new Error('Google Drive غير متصل. يرجى تسجيل الدخول وربط الحساب أولاً.');
    }

    try {
      const google = this.getGoogle();
      const oauth2Client = this.createOAuth2Client();
      oauth2Client.setCredentials(tokens);

      // Persist refreshed tokens automatically
      oauth2Client.on('tokens', (refreshedTokens: any) => {
        const merged = { ...this.getTokens(), ...refreshedTokens };
        this.saveTokens(merged);
        logger.info('[GoogleDrive] Automatically refreshed and saved Google Drive tokens.');
      });

      return google.drive({ version: 'v3', auth: oauth2Client });
    } catch {
      return this.buildRestDriveClient();
    }
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
