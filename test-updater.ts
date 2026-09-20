import { updaterService } from './server/services/updaterService.ts';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

async function runTest() {
  console.log("Starting updater integration test...");
  try {
    process.env.MISHKAT_UPDATE_ACCESS_SERVICE_URL = 'http://localhost:3001/api/update/latest';
    
    console.log("Checking for updates...");
    const result = await updaterService.checkForUpdates();
    
    console.log("Check result:", JSON.stringify(result, null, 2));

    if (!result.hasUpdate || !result.latestRelease) {
      console.log("No update found. Cannot proceed with download test.");
      return;
    }

    const release = result.latestRelease;
    console.log(`\nFound update version ${release.version}.`);
    console.log(`Temporary Download URL: ${release.downloadUrl.substring(0, 100)}...`);
    
    // Ensure no secrets are leaked in the URL
    if (release.downloadUrl.includes('ghs_') || release.downloadUrl.includes('jwt')) {
      console.error("❌ ERROR: GitHub token leaked in download URL!");
      process.exit(1);
    }
    
    const tempZipPath = path.join(process.cwd(), 'test-update.zip');
    
    console.log("\nDownloading release package...");
    await updaterService.downloadReleasePackage(release.downloadUrl, tempZipPath);
    console.log("Download complete.");
    
    console.log("\nVerifying SHA-256...");
    const fileBuffer = fs.readFileSync(tempZipPath);
    const actualSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    console.log(`Expected SHA-256: ${release.sha256.toLowerCase()}`);
    console.log(`Actual SHA-256:   ${actualSha256.toLowerCase()}`);
    
    if (actualSha256.toLowerCase() === release.sha256.toLowerCase()) {
      console.log("✅ SHA-256 matches exactly!");
    } else {
      console.error("❌ SHA-256 mismatch!");
      process.exit(1);
    }
    
    // Clean up
    fs.unlinkSync(tempZipPath);
    console.log("\n✅ Integration test completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Test failed with error:", error);
    process.exit(1);
  }
}

runTest();
