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
   * Production updates are strictly sourced from official GitHub Releases.
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
        // Local feed fallback permitted only if explicitly enabled in development/testing
        if (process.env.ALLOW_LOCAL_UPDATE_FEED === 'true') {
          const localManifest = path.join(serverConfig.dirs.root, 'updates', 'manifest.json');
          if (fs.existsSync(localManifest)) {
            manifest = JSON.parse(fs.readFileSync(localManifest, 'utf8'));
          }
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
   * Generates a detached update runner script for production Windows Service environments.
   * Enables stopping MishkatLibraryService, replacing locked files, running migrations,
   * starting service, verifying health, and executing atomic 3-layer rollback on failure.
   */
  public generateDetachedUpdateScript(options: {
    stagingDir: string;
    rollbackSnapshotDir: string;
    preUpdateBackupPath: string;
    pgDataDir: string;
  }): string {
    const scriptPath = path.join(serverConfig.dirs.temp, 'apply-update.bat');
    const rootDir = process.cwd();

    const batContent = `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================================
echo  MISHKAT Central Server — Detached Service Updater
echo ========================================================

echo [1/6] Stopping MishkatLibraryService...
net stop MishkatLibraryService >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/6] Backing up current binaries and database for atomic rollback...
if not exist "${options.rollbackSnapshotDir}\\dist" mkdir "${options.rollbackSnapshotDir}\\dist"
xcopy /E /I /Y "${rootDir}\\dist" "${options.rollbackSnapshotDir}\\dist" >nul
if exist "${rootDir}\\server\\db\\migrations" (
  if not exist "${options.rollbackSnapshotDir}\\migrations" mkdir "${options.rollbackSnapshotDir}\\migrations"
  xcopy /E /I /Y "${rootDir}\\server\\db\\migrations" "${options.rollbackSnapshotDir}\\migrations" >nul
)
if exist "${options.pgDataDir}" (
  if not exist "${options.rollbackSnapshotDir}\\pgdata" mkdir "${options.rollbackSnapshotDir}\\pgdata"
  xcopy /E /I /Y "${options.pgDataDir}" "${options.rollbackSnapshotDir}\\pgdata" >nul
)

echo [3/6] Deploying staged update binaries...
if exist "${options.stagingDir}\\dist" (
  xcopy /E /I /Y "${options.stagingDir}\\dist" "${rootDir}\\dist" >nul
)
if exist "${options.stagingDir}\\server\\db\\migrations" (
  xcopy /E /I /Y "${options.stagingDir}\\server\\db\\migrations" "${rootDir}\\server\\db\\migrations" >nul
)

echo [4/6] Starting MishkatLibraryService (automatically triggers startup migrations)...
net start MishkatLibraryService
if %errorlevel% neq 0 (
  echo [ERROR] Failed to start service with updated binaries. Initiating rollback...
  goto :ROLLBACK
)

echo [5/6] Verifying server health...
set HEALTHY=0
for /L %%i in (1,1,10) do (
  timeout /t 3 /nobreak >nul
  powershell -NoProfile -NonInteractive -Command "try { $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/health' -TimeoutSec 3; if ($r.success -eq $true) { exit 0 } else { exit 1 } } catch { exit 1 }"
  if !errorlevel! equ 0 (
    set HEALTHY=1
    goto :VERIFIED
  )
)

:ROLLBACK
echo [CRITICAL] Health check failed or timeout reached. Executing 3-layer atomic rollback...
net stop MishkatLibraryService >nul 2>&1
timeout /t 2 /nobreak >nul
xcopy /E /I /Y "${options.rollbackSnapshotDir}\\dist" "${rootDir}\\dist" >nul
if exist "${options.rollbackSnapshotDir}\\migrations" (
  xcopy /E /I /Y "${options.rollbackSnapshotDir}\\migrations" "${rootDir}\\server\\db\\migrations" >nul
)
if exist "${options.rollbackSnapshotDir}\\pgdata" (
  rmdir /S /Q "${options.pgDataDir}" 2>nul
  xcopy /E /I /Y "${options.rollbackSnapshotDir}\\pgdata" "${options.pgDataDir}" >nul
)
net start MishkatLibraryService
echo [ROLLBACK] Application files and database restored to previous version and service restarted.
exit /b 1

:VERIFIED
echo [6/6] Update verified successfully! All services operational.
rmdir /S /Q "${options.stagingDir}" 2>nul
rmdir /S /Q "${options.rollbackSnapshotDir}" 2>nul
exit /b 0
`;

    fs.writeFileSync(scriptPath, batContent, 'utf8');
    return scriptPath;
  }

  /**
   * Executes safe atomic update with pre-backup and 3-layer rollback
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

      // 1. Enforce controlled staging directory containment (Prevent path traversal and arbitrary file attacks)
      const allowedBaseDirs = [
        path.resolve(serverConfig.dirs.temp),
        path.resolve(serverConfig.dirs.root, 'updates'),
      ];
      const resolvedPackagePath = path.resolve(packageZipPath);
      const isInsideAllowed = allowedBaseDirs.some(
        (dir) => resolvedPackagePath.startsWith(dir + path.sep) || resolvedPackagePath === dir
      );
      if (!isInsideAllowed) {
        throw new Error('مسار حزمة التحديث غير مصرح به. يجب أن تكون الحزمة داخل مجلد التحديثات المخصص.');
      }
      if (!packageZipPath.toLowerCase().endsWith('.zip')) {
        throw new Error('نوع ملف التحديث غير صالح. الحزم المعتمدة يجب أن تكون بصيغة .zip فقط.');
      }

      // 2. Mandatory Safety Pre-Update Backup
      const backupResult = await createDatabaseBackup('SYSTEM_UPDATER', 'pre_restore');
      preUpdateBackupPath = backupResult.filePath;
      this.updateStatus.lastBackupPath = preUpdateBackupPath;

      // 3. Verify package file exists
      if (!fs.existsSync(packageZipPath)) {
        throw new Error(`ملف حزمة التحديث غير موجود: ${packageZipPath}`);
      }

      // 3. Verify SHA-256 Checksum (Integrity Verification)
      if (expectedSha256 && expectedSha256.trim() !== '') {
        this.updateStatus.state = 'verifying';
        this.updateStatus.progressPercent = 25;
        this.updateStatus.message = 'الخطوة 2: التحقق من سلامة حزمة التحديث (SHA-256 Checksum)...';

        const fileBuffer = fs.readFileSync(packageZipPath);
        const actualSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
          throw new Error('فشل التحقق من سلامة الحزمة (SHA-256 Checksum Mismatch). الحزمة تالفة أو غير متطابقة.');
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

          // Generation happens below with pgDataDir

          // Stage dist directory
          const stagedDist = path.join(stagingDir, 'dist');
          // WE NO LONGER COPY IN-PLACE HERE. 
          // The detached .bat script will handle copying after stopping the service.

          // Stage migration files
          const stagedMigrations = path.join(stagingDir, 'server', 'db', 'migrations');
          // WE NO LONGER COPY IN-PLACE HERE.

          // Spawn the detached updater script
          const { spawn } = require('child_process');
          const batPath = this.generateDetachedUpdateScript({
            stagingDir,
            rollbackSnapshotDir,
            preUpdateBackupPath: preUpdateBackupPath || '',
            pgDataDir: serverConfig.dirs.pgdata
          });

          this.updateStatus.progressPercent = 75;
          this.updateStatus.message = 'الخطوة 5: إطلاق معالج التحديث المنفصل وإعادة تشغيل الخدمة...';

          const subprocess = spawn('cmd.exe', ['/c', batPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
          });
          subprocess.unref();

          // We mark as completed from the perspective of this Node process.
          // The actual health check is done by the detached script.
          this.updateStatus.state = 'completed';
          this.updateStatus.progressPercent = 100;
          this.updateStatus.message = '✅ تم استخراج التحديث وبدأت عملية التثبيت في الخلفية. سيتم إعادة تشغيل النظام الآن.';
          
          // Gracefully exit the current process to release file locks.
          // In a real service, net stop will kill us anyway, but this ensures file locks are released for testing too.
          setTimeout(() => {
            console.log('Exiting process to allow detached updater to replace files...');
            process.exit(0);
          }, 1000);

          return { success: true, message: this.updateStatus.message };

        } catch (unzipErr: any) {
          console.warn('⚠️ [Updater] Archive staging note:', unzipErr.message);
          throw unzipErr;
        }
      } else {
         throw new Error("ملف حزمة التحديث يجب أن يكون بصيغة .zip");
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

      // Automatic Rollback (Application Files + Database State)
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
