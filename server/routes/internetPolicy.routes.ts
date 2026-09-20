import express from 'express';
import { internetPolicyService } from '../services/internetPolicyService';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = express.Router();

// Public PAC file endpoint for student enforcement
router.get('/proxy.pac', async (req, res) => {
  try {
    const mode = await internetPolicyService.getPolicyMode();
    let pacContent = `function FindProxyForURL(url, host) {\n`;

    // Always allow localhost/127.0.0.1 for local app access
    pacContent += `  if (shExpMatch(host, "127.0.0.1") || shExpMatch(host, "localhost") || shExpMatch(host, "*.local")) {\n`;
    pacContent += `    return "DIRECT";\n`;
    pacContent += `  }\n`;

    if (mode === 'OPEN') {
      pacContent += `  return "DIRECT";\n`;
    } else if (mode === 'OFFLINE') {
      pacContent += `  return "PROXY 127.0.0.1:9999";\n`; // Blackhole everything else
    } else {
      // RESTRICTED mode: apply blocklist
      const sites = await internetPolicyService.getBlockedSites();
      for (const site of sites) {
        if (site.isActive) {
          pacContent += `  if (dnsDomainIs(host, "${site.domain}") || dnsDomainIs(host, ".${site.domain}")) {\n`;
          pacContent += `    return "PROXY 127.0.0.1:9999";\n`; // Blackhole
          pacContent += `  }\n`;
        }
      }
      pacContent += `  return "DIRECT";\n`;
    }
    
    pacContent += `}\n`;
    res.setHeader('Content-Type', 'application/x-ns-proxy-autoconfig');
    res.send(pacContent);
  } catch (error) {
    res.status(500).send('function FindProxyForURL(url, host) { return "DIRECT"; }');
  }
});

router.use(authenticateToken);
router.use(requireRole('admin'));

// Policy Mode
router.get('/mode', async (req, res) => {
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
router.get('/categories', async (req, res) => {
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
router.get('/sites', async (req, res) => {
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
    const addedBy = req.user?.id || 'system';
    const site = await internetPolicyService.createBlockedSite(domain, categoryId, addedBy);
    res.status(201).json(site);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create blocked site' });
  }
});

router.post('/sites/bulk', async (req, res) => {
  try {
    const { domains, categoryId } = req.body;
    if (!Array.isArray(domains)) return res.status(400).json({ error: 'Domains must be an array' });
    const addedBy = req.user?.id || 'system';
    const result = await internetPolicyService.createBlockedSitesBulk(domains, categoryId, addedBy);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to bulk create blocked sites' });
  }
});

router.put('/sites/:id', async (req, res) => {
  try {
    const { domain, categoryId, isActive } = req.body;
    const site = await internetPolicyService.updateBlockedSite(req.params.id, domain, categoryId, isActive);
    res.json(site);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update blocked site' });
  }
});

router.delete('/sites/:id', async (req, res) => {
  try {
    await internetPolicyService.deleteBlockedSite(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete blocked site' });
  }
});

export default router;
