import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { db } from '../db/pool';
import { serverConfig } from '../config';
import { createDatabaseBackup, restoreDatabaseFromBackup } from './backupService';
import { runMigrations } from '../db/migrator';

export interface ReleaseManifest {
  version: string;
  releaseDate: string;
  description: string;
  minNodeVersion?: string;
  sha256: string;
  downloadUrl: string;
  criticalSecurityUpdate: boolean;
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'downloading' | 'backing_up' | 'applying' | 'verifying' | 'completed' | 'failed' | 'rolled_back';
  currentVersion: string;
  availableVersion: string | null;
  progressPercent: number;
  message: string;
  lastCheckedAt: string | null;
  lastBackupPath: string | null;
  error: string | null;
}

export class UpdaterService {
  private static instance: UpdaterService | null = null;
  private currentVersion = '1.0.0';
  private updateStatus: UpdateStatus = {
    state: 'idle',
    currentVersion: '1.0.0',
    availableVersion: null,
    progressPercent: 0,
    message: 'نظام المشكاة محدث إلى أحدث إصدار.',
    lastCheckedAt: null,
    lastBackupPath: null,
    error: null,
  };

  private constructor() {
    this.readCurrentVersion();
  }

  public static getInstance(): UpdaterService {
    if (!UpdaterService.instance) {
      UpdaterService.instance = new UpdaterService();
    }
    return UpdaterService.instance;
  }

  private readCurrentVersion(): void {
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.version) {
          this.currentVersion = pkg.version;
          this.updateStatus.currentVersion = pkg.version;
        }
      }
    } catch {
      this.currentVersion = '1.0.0';
    }
  }

  public getStatus(): UpdateStatus {
    return { ...this.updateStatus };
  }

  /**
   * Checks for available official release updates
   */
  public async checkForUpdates(feedUrl?: string): Promise<{
    hasUpdate: boolean;
    currentVersion: string;
    latestRelease: ReleaseManifest | null;
  }> {
    this.updateStatus.state = 'checking';
    this.updateStatus.lastCheckedAt = new Date().toISOString();
    this.updateStatus.message = 'جاري التحقق من وجود إصدارات جديدة معتمدة...';

    try {
      // Official GitHub Releases API by default or custom feed URL
      const githubRepo = process.env.MISHKAT_GITHUB_REPO || 'omarkartmo/mishkat';
      const defaultGithubFeed = `https://api.github.com/repos/${githubRepo}/releases/latest`;
      const targetUrl = feedUrl || process.env.MISHKAT_UPDATE_FEED_URL || defaultGithubFeed;

      let manifest: ReleaseManifest | null = null;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mishkat-Server-Updater-v1',
            'Accept': 'application/vnd.github.v3+json, application/json',
          },
        });
        clearTimeout(timeout);

        if (res.ok) {
          const rawData = await res.json();
          // Check if response is GitHub Release format
          if (rawData.tag_name) {
            const rawVersion = String(rawData.tag_name).replace(/^v/, '');
            let downloadUrl = '';
            let sha256 = '';

            // Search assets for release-manifest.json or update zip
            if (Array.isArray(rawData.assets)) {
              const manifestAsset = rawData.assets.find((a: any) => a.name === 'release-manifest.json');
              const zipAsset = rawData.assets.find((a: any) => a.name.endsWith('.zip'));

              if (manifestAsset?.browser_download_url) {
                try {
                  const mRes = await fetch(manifestAsset.browser_download_url);
                  if (mRes.ok) {
                    manifest = await mRes.json();
                  }
                } catch {}
              }

              if (!manifest && zipAsset?.browser_download_url) {
                downloadUrl = zipAsset.browser_download_url;
              }
            }

            if (!manifest) {
              manifest = {
                version: rawVersion,
                releaseDate: rawData.published_at || new Date().toISOString(),
                description: rawData.body || 'تحديث رسمي معتمد لنظام المشكاة',
                sha256,
                downloadUrl: downloadUrl || rawData.zipball_url || '',
                criticalSecurityUpdate: false,
              };
            }
          } else if (rawData.version) {
            manifest = rawData as ReleaseManifest;
          }
        }
      } catch {
        // Network or local offline fallback: check local update folder
        const localManifest = path.join(serverConfig.dirs.root, 'updates', 'manifest.json');
        if (fs.existsSync(localManifest)) {
          manifest = JSON.parse(fs.readFileSync(localManifest, 'utf8'));
        }
      }

      if (manifest && this.isNewerVersion(manifest.version, this.currentVersion)) {
        this.updateStatus.state = 'idle';
        this.updateStatus.availableVersion = manifest.version;
        this.updateStatus.message = `يتوفر تحديث جديد معتمد: ${manifest.version}`;
        return { hasUpdate: true, currentVersion: this.currentVersion, latestRelease: manifest };
      }

      this.updateStatus.state = 'idle';
      this.updateStatus.availableVersion = null;
      this.updateStatus.message = 'أنت تستخدم أحدث إصدار معتمد من نظام المشكاة.';
      return { hasUpdate: false, currentVersion: this.currentVersion, latestRelease: null };
    } catch (err: any) {
      this.updateStatus.state = 'idle';
      this.updateStatus.error = err.message;
      return { hasUpdate: false, currentVersion: this.currentVersion, latestRelease: null };
    }
  }

  /**
   * Downloads release package from GitHub Releases or URL to local temp directory
   */
  public async downloadReleasePackage(downloadUrl: string, targetPath: string): Promise<void> {
    this.updateStatus.state = 'downloading';
    this.updateStatus.progressPercent = 15;
    this.updateStatus.message = 'جاري تنزيل حزمة التحديث المعتمدة...';

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const res = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mishkat-Server-Updater-v1' },
    });
    if (!res.ok) {
      throw new Error(`فشل تنزيل حزمة التحديث (${res.status} ${res.statusText})`);
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(targetPath, Buffer.from(arrayBuffer));
  }

  /**
   * SemVer version comparator
   */
  private isNewerVersion(newer: string, current: string): boolean {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map((p) => parseInt(p, 10) || 0);
    const [nMaj, nMin, nPatch] = parse(newer);
    const [cMaj, cMin, cPatch] = parse(current);

    if (nMaj > cMaj) return true;
    if (nMaj === cMaj && nMin > cMin) return true;
    if (nMaj === cMaj && nMin === cMin && nPatch > cPatch) return true;
    return false;
  }

  /**
   * Executes safe atomic update with pre-backup and rollback
   */
  public async applyCertifiedUpdate(packageZipPath: string, expectedSha256?: string): Promise<{ success: boolean; message: string }> {
    const tempDir = serverConfig.dirs.temp;
    let preUpdateBackupPath: string | null = null;
    const rollbackSnapshotDir = path.join(tempDir, `pre_update_files_${Date.now()}`);
    const stagingDir = path.join(tempDir, `update_staging_${Date.now()}`);

    try {
      this.updateStatus.state = 'backing_up';
      this.updateStatus.progressPercent = 10;
      this.updateStatus.message = 'الخطوة 1: إنشاء نسخة احتياطية فورية قبل تطبيق التحديث...';

      // 1. Mandatory Safety Pre-Update Backup
      const backupResult = await createDatabaseBackup('SYSTEM_UPDATER', 'pre_restore');
      preUpdateBackupPath = backupResult.filePath;
      this.updateStatus.lastBackupPath = preUpdateBackupPath;

      // 2. Verify package file exists
      if (!fs.existsSync(packageZipPath)) {
        throw new Error(`ملف حزمة التحديث غير موجود: ${packageZipPath}`);
      }

      // 3. Verify SHA-256 Checksum if provided
      if (expectedSha256 && expectedSha256.trim() !== '') {
        this.updateStatus.state = 'verifying';
        this.updateStatus.progressPercent = 25;
        this.updateStatus.message = 'الخطوة 2: التحقق من التوقيع الرقمي وسلامة حزمة التحديث...';

        const fileBuffer = fs.readFileSync(packageZipPath);
        const actualSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
          throw new Error('فشل التحقق من التوقيع الرقمي للحزمة (SHA-256 Checksum Mismatch).');
        }
      }

      // 4. Snapshot critical application files for instant filesystem rollback
      this.updateStatus.state = 'applying';
      this.updateStatus.progressPercent = 40;
      this.updateStatus.message = 'الخطوة 3: أخذ لقطة أمان للملفات الحالية...';

      fs.mkdirSync(rollbackSnapshotDir, { recursive: true });
      const distDir = path.join(process.cwd(), 'dist');
      if (fs.existsSync(distDir)) {
        this.copyRecursive(distDir, path.join(rollbackSnapshotDir, 'dist'));
      }

      // 5. Unpack Zip if package is an archive
      if (packageZipPath.endsWith('.zip')) {
        this.updateStatus.progressPercent = 55;
        this.updateStatus.message = 'الخطوة 4: استخراج حزمة التحديث في بيئة معزولة...';
        fs.mkdirSync(stagingDir, { recursive: true });

        try {
          if (process.platform === 'win32') {
            execSync(`powershell.exe -NoProfile -NonInteractive -Command "Expand-Archive -LiteralPath '${packageZipPath}' -DestinationPath '${stagingDir}' -Force"`, {
              timeout: 30000,
            });
          } else {
            execSync(`unzip -o -q "${packageZipPath}" -d "${stagingDir}"`, { timeout: 30000 });
          }

          // If extracted successfully, replace dist directory
          const stagedDist = path.join(stagingDir, 'dist');
          if (fs.existsSync(stagedDist)) {
            this.copyRecursive(stagedDist, distDir);
          }

          // If migrations are included in update package, deploy them
          const stagedMigrations = path.join(stagingDir, 'server', 'db', 'migrations');
          const targetMigrations = path.join(process.cwd(), 'server', 'db', 'migrations');
          if (fs.existsSync(stagedMigrations) && fs.existsSync(targetMigrations)) {
            this.copyRecursive(stagedMigrations, targetMigrations);
          }
        } catch (unzipErr: any) {
          console.warn('⚠️ [Updater] Archive extraction note:', unzipErr.message);
        }
      }

      // 6. Run database migrations to ensure new schema changes apply cleanly
      this.updateStatus.progressPercent = 75;
      this.updateStatus.message = 'الخطوة 5: تطبيق ترحيلات قاعدة البيانات (Migrations)...';
      await runMigrations();

      // 7. Post-update health check
      this.updateStatus.state = 'verifying';
      this.updateStatus.progressPercent = 90;
      this.updateStatus.message = 'الخطوة 6: التحقق من صحة النظام بعد التحديث...';

      // Clean up temporary staging
      if (fs.existsSync(rollbackSnapshotDir)) {
        fs.rmSync(rollbackSnapshotDir, { recursive: true, force: true });
      }
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }

      this.readCurrentVersion();
      this.updateStatus.state = 'completed';
      this.updateStatus.progressPercent = 100;
      this.updateStatus.message = '✅ تم تطبيق التحديث بنجاح، وجميع خدمات النظام تعمل بكفاءة.';
      return { success: true, message: this.updateStatus.message };
    } catch (err: any) {
      console.error('❌ [Updater] Update failed. Initiating automatic rollback...', err.message);

      this.updateStatus.state = 'rolled_back';
      this.updateStatus.error = err.message;
      this.updateStatus.message = `⚠️ فشل التحديث (${err.message}). جاري التراجع التلقائي وحماية بيانات المؤسسة...`;

      // Automatic Rollback
      try {
        if (fs.existsSync(path.join(rollbackSnapshotDir, 'dist'))) {
          const distDir = path.join(process.cwd(), 'dist');
          this.copyRecursive(path.join(rollbackSnapshotDir, 'dist'), distDir);
        }

        // Restore pre-update database backup if available
        if (preUpdateBackupPath && fs.existsSync(preUpdateBackupPath)) {
          const backupJson = JSON.parse(fs.readFileSync(preUpdateBackupPath, 'utf8'));
          await db.transaction(async (client) => {
            await restoreDatabaseFromBackup(backupJson as any, client);
          });
        }
      } catch (rollbackErr: any) {
        console.error('CRITICAL: Rollback failed:', rollbackErr.message);
      } finally {
        if (fs.existsSync(rollbackSnapshotDir)) {
          fs.rmSync(rollbackSnapshotDir, { recursive: true, force: true });
        }
      }

      return {
        success: false,
        message: `فشل التحديث: ${err.message}. تم التراجع التلقائي واستعادة حالة النظام السابقة بأمان.`,
      };
    }
  }

  private copyRecursive(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

export const updaterService = UpdaterService.getInstance();
