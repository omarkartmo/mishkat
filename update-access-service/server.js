const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Configuration
const APP_ID = process.env.GITHUB_APP_ID;
const INSTALLATION_ID = process.env.GITHUB_INSTALLATION_ID;
const PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY ? process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n') : null;
const TARGET_REPO = process.env.MISHKAT_TARGET_REPO || 'omarkartmo/mishkat';

// In-memory cache for the installation token to avoid hitting rate limits
let tokenCache = {
    token: null,
    expiresAt: null
};

/**
 * Generates an Installation Token using the GitHub App Private Key
 */
async function getInstallationToken() {
    if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
        return tokenCache.token;
    }

    if (!APP_ID || !INSTALLATION_ID || !PRIVATE_KEY) {
        throw new Error('Missing GitHub App credentials in environment.');
    }

    // Generate JWT for GitHub App
    const payload = {
        iat: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + (10 * 60),
        iss: APP_ID
    };

    const appJwt = jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256' });

    // Exchange JWT for Installation Access Token
    const res = await fetch(`https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${appJwt}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'Mishkat-Update-Access-Service/1.0'
        }
    });

    if (!res.ok) {
        const errBody = await res.text();
        console.error('Failed to authenticate as GitHub App:', errBody);
        throw new Error('GitHub App Authentication failed');
    }

    const data = await res.json();
    
    // Cache the token (GitHub tokens usually expire in 1 hour, we cache it for slightly less)
    tokenCache = {
        token: data.token,
        expiresAt: new Date(data.expires_at).getTime() - 60000 // 1 minute buffer
    };

    console.log('GitHub authentication successful. Generated new installation token.');
    return data.token;
}

/**
 * Helper to fetch temporary S3 URL for a release asset
 */
async function getTemporaryAssetUrl(assetUrl, token) {
    const res = await fetch(assetUrl, {
        redirect: 'manual', // Prevent fetch from automatically following the redirect
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/octet-stream',
            'User-Agent': 'Mishkat-Update-Access-Service/1.0'
        }
    });

    if (res.status === 302 || res.status === 301) {
        return res.headers.get('location');
    }

    // If it didn't redirect, something unexpected happened or GitHub served it directly (very rare for zip)
    if (res.ok) {
        // Technically this shouldn't happen for application/octet-stream on large releases
        console.warn('Unexpected non-redirect response from GitHub for asset.');
        return assetUrl; 
    }

    throw new Error(`Failed to get temporary asset URL. Status: ${res.status}`);
}

app.get('/api/update/latest', async (req, res) => {
    try {
        const token = await getInstallationToken();

        // 1. Fetch latest release metadata from GitHub
        const releaseRes = await fetch(`https://api.github.com/repos/${TARGET_REPO}/releases/latest`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'Mishkat-Update-Access-Service/1.0'
            }
        });

        if (!releaseRes.ok) {
            console.error('Release lookup failed. Status:', releaseRes.status);
            return res.status(releaseRes.status).json({ error: 'Release lookup failed' });
        }

        const releaseData = await releaseRes.json();
        const assets = releaseData.assets || [];

        // 2. Identify the required assets
        const manifestAsset = assets.find(a => a.name === 'release-manifest.json');
        const zipAsset = assets.find(a => a.name.endsWith('.zip'));

        if (!manifestAsset || !zipAsset) {
            return res.status(404).json({ error: 'Release assets not fully available yet.' });
        }

        console.log('Release lookup successful. Assets found.');

        // 3. Obtain temporary direct URLs
        const manifestTempUrl = await getTemporaryAssetUrl(manifestAsset.url, token);
        const zipTempUrl = await getTemporaryAssetUrl(zipAsset.url, token);
        
        console.log('Temporary asset URLs generated successfully.');

        // 4. Return clean response to the client
        res.json({
            version: releaseData.tag_name.replace(/^v/, ''),
            manifestUrl: manifestTempUrl,
            downloadUrl: zipTempUrl,
            releaseNotes: releaseData.body,
            publishedAt: releaseData.published_at
        });

    } catch (error) {
        console.error('Update Access Service Error:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Update Access Service running on port ${port}`);
});
