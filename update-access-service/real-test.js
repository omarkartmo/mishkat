const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

async function runRealTest() {
    console.log('--- Running Real Test ---');
    console.log('Ensure the server is running on http://localhost:3001');

    try {
        // Step 1: Hit our Service Endpoint
        const res = await fetch('http://localhost:3001/api/update/latest');
        
        if (!res.ok) {
            console.error('\n❌ FAILED: API Status Code', res.status);
            const errBody = await res.text();
            console.error('Response:', errBody);
            process.exit(1);
        }

        const data = await res.json();
        
        console.log('\n--- Service Response ---');
        console.log('Status Code:', res.status);
        console.log('Response Keys:', Object.keys(data));

        // Secret isolation check
        const responseStr = JSON.stringify(data);
        if (responseStr.includes('-----BEGIN PRIVATE KEY-----') || responseStr.includes('eyJh')) {
            console.error('\n❌ FAILED: Secrets leaked in response!');
            process.exit(1);
        }

        if (!data.downloadUrl || !data.manifestUrl) {
            console.error('\n❌ FAILED: Missing temporary URLs in response.');
            process.exit(1);
        }

        // Verify it's a GitHub S3 URL (should not be api.github.com)
        if (data.downloadUrl.includes('api.github.com')) {
            console.error('\n❌ FAILED: downloadUrl is still api.github.com, meaning 302 was not intercepted properly.');
            process.exit(1);
        }

        console.log('\n✅ SUCCESS: 302 intercepted and Temporary URLs generated.');

        // Step 2: Download Manifest directly from Temporary URL
        console.log('\nDownloading Manifest from Temporary URL...');
        const manifestRes = await fetch(data.manifestUrl);
        if (!manifestRes.ok) {
            console.error('\n❌ FAILED to download manifest:', manifestRes.status);
            process.exit(1);
        }
        const manifest = await manifestRes.json();
        console.log('Manifest downloaded successfully. Version:', manifest.version);

        // Step 3: Download ZIP directly from Temporary URL
        console.log('\nDownloading ZIP from Temporary URL (Direct Download)...');
        const zipRes = await fetch(data.downloadUrl);
        if (!zipRes.ok) {
            console.error('\n❌ FAILED to download ZIP:', zipRes.status);
            process.exit(1);
        }
        
        const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
        
        if (zipBuffer.length === 0) {
            console.error('\n❌ FAILED: Downloaded ZIP is empty (0 bytes).');
            process.exit(1);
        }

        // Check ZIP magic bytes (PK\x03\x04)
        if (zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4B || zipBuffer[2] !== 0x03 || zipBuffer[3] !== 0x04) {
            console.error('\n❌ FAILED: Downloaded file is not a valid ZIP archive.');
            process.exit(1);
        }

        console.log(`✅ SUCCESS: Direct ZIP download successful. Size: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        console.log('✅ SUCCESS: ZIP integrity passed (Valid Magic Bytes).');

        // Step 4: Verify SHA-256
        let shaStatus = 'N/A';
        if (manifest.sha256) {
            console.log('\nVerifying SHA-256...');
            const hash = crypto.createHash('sha256');
            hash.update(zipBuffer);
            const computedHash = hash.digest('hex');
            
            if (computedHash === manifest.sha256) {
                console.log('✅ SUCCESS: SHA-256 matches manifest!');
                shaStatus = 'PASS';
            } else {
                console.error(`\n❌ FAILED: SHA-256 mismatch! Expected: ${manifest.sha256}, Got: ${computedHash}`);
                process.exit(1);
            }
        }

        console.log('\n--- ALL TESTS PASSED ---');
        console.log('SHA_STATUS=' + shaStatus);

    } catch (error) {
        console.error('\n❌ FAILED:', error.message);
        process.exit(1);
    }
}

runRealTest();
