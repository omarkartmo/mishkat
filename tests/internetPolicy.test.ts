import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../server/db/pool';
import { internetPolicyService } from '../server/services/internetPolicyService';
import request from 'supertest';
import express from 'express';
import internetPolicyRoutes from '../server/routes/internetPolicy.routes';

describe('Internet Policy Service & PAC Generation', () => {
  let app: express.Express;

  beforeAll(async () => {
    await db.connect();
    app = express();
    app.use(express.json());
    app.use('/api/v1/internet-policy', internetPolicyRoutes);
  });

  afterAll(async () => {
    await db.close();
  });

  it('normalizes domains accurately by stripping protocols, paths, ports, wildcards, and www', () => {
    expect(internetPolicyService.normalizeDomain('https://www.facebook.com/')).toBe('facebook.com');
    expect(internetPolicyService.normalizeDomain('http://facebook.com/path?query=1')).toBe('facebook.com');
    expect(internetPolicyService.normalizeDomain('*.youtube.com')).toBe('youtube.com');
    expect(internetPolicyService.normalizeDomain('www.instagram.com:443')).toBe('instagram.com');
    expect(internetPolicyService.normalizeDomain('  tiktok.com  ')).toBe('tiktok.com');
    expect(internetPolicyService.normalizeDomain('kids.youtube.com')).toBe('kids.youtube.com');
  });

  it('defaults excludeServer to false for out-of-the-box protection', async () => {
    // Delete any existing override
    await db.query("DELETE FROM system_settings WHERE key = 'internet_policy_exclude_server'");
    const exclude = await internetPolicyService.getExcludeServer();
    expect(exclude).toBe(false);
  });

  it('generates high-performance PAC file without blocking isInNet DNS lookups', async () => {
    await internetPolicyService.setPolicyMode('RESTRICTED');
    await internetPolicyService.setExcludeServer(false);

    // Add a test site
    await internetPolicyService.createBlockedSite('testblockedsite.com', null, null);

    const res = await request(app).get('/api/v1/internet-policy/proxy.pac');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ns-proxy-autoconfig');
    
    const pac = res.text;

    // Verify absence of blocking isInNet DNS queries
    expect(pac).not.toContain('isInNet(');

    // Verify fast string matching for private subnets
    expect(pac).toContain('shExpMatch(host, "10.*")');
    expect(pac).toContain('shExpMatch(host, "192.168.*")');

    // Verify single fast blackhole proxy (not dual proxies)
    expect(pac).toContain('return "PROXY 127.0.0.1:9999";');
    expect(pac).not.toContain('PROXY 127.0.0.1:9998');

    // Verify clean domain match
    expect(pac).toContain('testblockedsite.com');
    expect(pac).toContain('dnsDomainIs(host, ".testblockedsite.com")');
    expect(pac).toContain('shExpMatch(host, "*.testblockedsite.com")');

    // Clean up
    const sites = await internetPolicyService.getBlockedSites();
    const testSite = sites.find(s => s.domain === 'testblockedsite.com');
    if (testSite) {
      await internetPolicyService.deleteBlockedSite(testSite.id);
    }
  });

  it('serves direct for OFFLINE vs OPEN vs RESTRICTED modes properly', async () => {
    await internetPolicyService.setExcludeServer(false);

    // Mode: OPEN
    await internetPolicyService.setPolicyMode('OPEN');
    let res = await request(app).get('/api/v1/internet-policy/proxy.pac');
    expect(res.text).toContain('Policy Mode: OPEN');
    expect(res.text).toContain('return "DIRECT";');

    // Mode: OFFLINE
    await internetPolicyService.setPolicyMode('OFFLINE');
    res = await request(app).get('/api/v1/internet-policy/proxy.pac');
    expect(res.text).toContain('Policy Mode: OFFLINE');
    expect(res.text).toContain('return "PROXY 127.0.0.1:9999";');

    // Reset back to RESTRICTED
    await internetPolicyService.setPolicyMode('RESTRICTED');
  });

  it('safely handles local windows proxy synchronization', async () => {
    const status = await internetPolicyService.getLocalWindowsProxyStatus();
    expect(status).toHaveProperty('configured');
    expect(status).toHaveProperty('autoConfigUrl');
  });
});
