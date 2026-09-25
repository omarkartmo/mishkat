import express from 'express';
import { internetPolicyService } from '../services/internetPolicyService';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import os from 'os';

const router = express.Router();

/**
 * Checks if incoming HTTP request originates from the local server machine itself
 */
function isLocalServerRequest(req: express.Request): boolean {
  const rawIp = req.ip || req.socket.remoteAddress || '';
  const cleanIp = rawIp.replace(/^.*:/, '').toLowerCase(); // strip IPv6 prefix e.g. ::ffff:
  if (!cleanIp || cleanIp === '1' || cleanIp === '127.0.0.1' || cleanIp === 'localhost') {
    return true;
  }
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      const ifaceClean = iface.address.replace(/^.*:/, '').toLowerCase();
      if (ifaceClean === cleanIp) {
        return true;
      }
    }
  }
  return false;
}

// Public PAC file endpoint for student & local proxy enforcement
router.get('/proxy.pac', async (req, res) => {
  try {
    const mode = await internetPolicyService.getPolicyMode();

    // Collect all IPv4 interface addresses for the Mishkat Server
    const serverLocalIps: string[] = ['127.0.0.1'];
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && iface.address && !serverLocalIps.includes(iface.address)) {
          serverLocalIps.push(iface.address);
        }
      }
    }

    let pacContent = `function FindProxyForURL(url, host) {\n`;

    // 1. ALWAYS allow localhost, local hostnames, and server LAN IPs directly
    // This guarantees that access to Mishkat Central Server (Port 3000) and local library assets is NEVER blocked
    pacContent += `  // Always allow access to Mishkat Central Server and local intranet\n`;
    pacContent += `  if (shExpMatch(host, "127.0.0.1") || shExpMatch(host, "localhost") || shExpMatch(host, "*.local") || isPlainHostName(host)) {\n`;
    pacContent += `    return "DIRECT";\n`;
    pacContent += `  }\n`;

    for (const sIp of serverLocalIps) {
      pacContent += `  if (shExpMatch(host, "${sIp}")) return "DIRECT";\n`;
    }

    // Direct access for common private IP ranges (instant string match, ZERO DNS lookups)
    pacContent += `  if (shExpMatch(host, "10.*") || shExpMatch(host, "192.168.*") || shExpMatch(host, "172.1[6-9].*") || shExpMatch(host, "172.2[0-9].*") || shExpMatch(host, "172.3[0-1].*")) {\n`;
    pacContent += `    return "DIRECT";\n`;
    pacContent += `  }\n\n`;

    // 2. Evaluate Policy Mode
    if (mode === 'OPEN') {
      pacContent += `  // Policy Mode: OPEN (all internet traffic permitted)\n`;
      pacContent += `  return "DIRECT";\n`;
    } else if (mode === 'OFFLINE') {
      pacContent += `  // Policy Mode: OFFLINE (blackhole all external web traffic; local library only)\n`;
      pacContent += `  return "PROXY 127.0.0.1:9999";\n`;
    } else {
      // RESTRICTED mode: apply active blocklist
      pacContent += `  // Policy Mode: RESTRICTED (blocking academic distractions)\n`;
      const sites = await internetPolicyService.getBlockedSites();
      const activeSites = sites.filter((s) => s.isActive);

      for (const site of activeSites) {
        const cleanDomain = internetPolicyService.normalizeDomain(site.domain);
        if (!cleanDomain) continue;
        
        // Exact and subdomain match
        pacContent += `  if (host === "${cleanDomain}" || dnsDomainIs(host, ".${cleanDomain}") || shExpMatch(host, "*.${cleanDomain}")) {\n`;
        pacContent += `    return "PROXY 127.0.0.1:9999";\n`;
        pacContent += `  }\n`;

        // Smart media platform matching (e.g. YouTube video streaming CDN & player infrastructure)
        if (cleanDomain.includes('youtube') || cleanDomain === 'youtu.be') {
          pacContent += `  if (shExpMatch(host, "*youtube*") || shExpMatch(host, "*googlevideo.com*") || shExpMatch(host, "*ytimg.com*") || shExpMatch(host, "*youtu.be*") || shExpMatch(host, "*ggpht.com*")) {\n`;
          pacContent += `    return "PROXY 127.0.0.1:9999";\n`;
          pacContent += `  }\n`;
        }
      }
      pacContent += `  return "DIRECT";\n`;
    }

    pacContent += `}\n`;

    res.setHeader('Content-Type', 'application/x-ns-proxy-autoconfig');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.send(pacContent);
  } catch (error) {
    res.setHeader('Content-Type', 'application/x-ns-proxy-autoconfig');
    return res.status(500).send('function FindProxyForURL(url, host) { return "DIRECT"; }\n');
  }
});

router.use(authenticateToken);
router.use(requireRole('admin'));

// Overall Policy Status
router.get('/status', async (_req, res) => {
  try {
    const mode = await internetPolicyService.getPolicyMode();
    const excludeServer = await internetPolicyService.getExcludeServer();
    const sites = await internetPolicyService.getBlockedSites();
    const localProxy = await internetPolicyService.getLocalWindowsProxyStatus();
    
    res.json({
      success: true,
      data: {
        mode,
        excludeServer,
        totalSitesCount: sites.length,
        activeSitesCount: sites.filter(s => s.isActive).length,
        localProxyConfigured: localProxy.configured,
        localProxyUrl: localProxy.autoConfigUrl,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch policy status', details: error.message });
  }
});

// Sync Local Windows Proxy on demand
router.post('/sync-local-proxy', async (_req, res) => {
  try {
    const result = await internetPolicyService.syncLocalWindowsProxy();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to sync local proxy', details: error.message });
  }
});

// Exclude Server Preference
router.get('/exclude-server', async (_req, res) => {
  try {
    const excludeServer = await internetPolicyService.getExcludeServer();
    res.json({ excludeServer });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch exclude server preference' });
  }
});

router.put('/exclude-server', async (req, res) => {
  try {
    const { excludeServer } = req.body;
    await internetPolicyService.setExcludeServer(!!excludeServer);
    res.json({ success: true, excludeServer: !!excludeServer });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update exclude server preference' });
  }
});

// Policy Mode
router.get('/mode', async (_req, res) => {
  try {
    const mode = await internetPolicyService.getPolicyMode();
    res.json({ mode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch policy mode' });
  }
});

router.put('/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    if (!['OPEN', 'RESTRICTED', 'OFFLINE'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }
    await internetPolicyService.setPolicyMode(mode);
    res.json({ success: true, mode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update policy mode' });
  }
});

// Categories
router.get('/categories', async (_req, res) => {
  try {
    const categories = await internetPolicyService.getCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name } = req.body;
    const category = await internetPolicyService.createCategory(name);
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const category = await internetPolicyService.updateCategory(req.params.id, name, isActive);
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    await internetPolicyService.deleteCategory(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Blocked Sites
router.get('/sites', async (_req, res) => {
  try {
    const sites = await internetPolicyService.getBlockedSites();
    res.json(sites);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch blocked sites' });
  }
});

router.post('/sites', async (req, res) => {
  try {
    const { domain, categoryId } = req.body;
    const addedBy = req.user?.id || null;
    const site = await internetPolicyService.createBlockedSite(domain, categoryId, addedBy);
    res.status(201).json(site);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create blocked site', details: error.message });
  }
});

router.post('/sites/bulk', async (req, res) => {
  try {
    const { domains, categoryId } = req.body;
    if (!Array.isArray(domains)) return res.status(400).json({ error: 'Domains must be an array' });
    const addedBy = req.user?.id || null;
    const result = await internetPolicyService.createBlockedSitesBulk(domains, categoryId, addedBy);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to bulk create blocked sites', details: error.message });
  }
});

router.put('/sites/:id', async (req, res) => {
  try {
    const { domain, categoryId, isActive } = req.body;
    const site = await internetPolicyService.updateBlockedSite(req.params.id, domain, categoryId, isActive);
    res.json(site);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update blocked site', details: error.message });
  }
});

router.delete('/sites/:id', async (req, res) => {
  try {
    await internetPolicyService.deleteBlockedSite(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete blocked site', details: error.message });
  }
});

export default router;
