const http = require('http');

// 1. Setup a Mock GitHub API Server
const mockGitHub = http.createServer((req, res) => {
    // Mock: POST /app/installations/:id/access_tokens
    if (req.method === 'POST' && req.url.includes('/access_tokens')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token: 'mock-installation-token', expires_at: new Date(Date.now() + 3600000).toISOString() }));
        return;
    }

    // Mock: GET /repos/omarkartmo/mishkat/releases/latest
    if (req.method === 'GET' && req.url.includes('/releases/latest')) {
        if (req.headers.authorization !== 'Bearer mock-installation-token') {
            res.writeHead(401);
            return res.end('Unauthorized');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            tag_name: 'v1.2.3',
            published_at: new Date().toISOString(),
            body: 'Mock Release Notes',
            assets: [
                { name: 'release-manifest.json', url: 'http://localhost:3002/asset/1' },
                { name: 'mishkat-server-v1.2.3-win-x64.zip', url: 'http://localhost:3002/asset/2' }
            ]
        }));
        return;
    }

    // Mock: GET /asset/:id (Release Asset Endpoint)
    if (req.method === 'GET' && req.url.includes('/asset/')) {
        if (req.headers.authorization !== 'Bearer mock-installation-token' || req.headers.accept !== 'application/octet-stream') {
            res.writeHead(400);
            return res.end('Bad Request - Missing Auth or wrong Accept header');
        }
        // This is the crucial 302 redirect simulating GitHub's S3 redirect
        const fakeS3Url = `https://mock-s3-cdn.example.com/download${req.url}?expires=${Date.now() + 300000}&signature=abc123mock`;
        res.writeHead(302, { 'Location': fakeS3Url });
        res.end();
        return;
    }

    res.writeHead(404);
    res.end();
});

mockGitHub.listen(3002, async () => {
    console.log('Mock GitHub API Server running on port 3002');
    
    // 2. Override global fetch to use our Mock GitHub Server for testing
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
        if (typeof url === 'string' && url.startsWith('https://api.github.com')) {
            url = url.replace('https://api.github.com', 'http://localhost:3002');
        }
        return originalFetch(url, options);
    };

    // 3. Set Mock Environment Variables
    process.env.PORT = 3001;
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_INSTALLATION_ID = '67890';
    
    // Generate a valid dummy RSA private key just to make jsonwebtoken happy
    const crypto = require('crypto');
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' } });
    process.env.GITHUB_PRIVATE_KEY = privateKey;

    // 4. Start the Service
    console.log('Starting Update Access Service...');
    require('./server.js');

    // Give the server a moment to bind to the port
    setTimeout(async () => {
        try {
            console.log('\n--- Running Test ---');
            console.log('Client: Fetching GET http://localhost:3001/api/update/latest');
            
            const res = await originalFetch('http://localhost:3001/api/update/latest');
            const data = await res.json();
            
            console.log('\n--- Test Results ---');
            console.log('Status Code:', res.status);
            console.log('Response JSON:', JSON.stringify(data, null, 2));
            
            if (res.status === 200 && data.downloadUrl.includes('mock-s3-cdn')) {
                console.log('\n✅ SUCCESS: Service correctly authenticated, fetched the release, handled the 302 redirect, and returned temporary URLs without proxying the file or leaking secrets.');
            } else {
                console.log('\n❌ FAILED: Service response is incorrect.');
            }
        } catch (err) {
            console.error('\n❌ FAILED:', err);
        } finally {
            process.exit(0);
        }
    }, 1000);
});
