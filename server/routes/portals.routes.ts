import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { PortalManager } from '../services/portals/portalManager';
import { VerificationService } from '../services/portals/VerificationService';
import { validateSafeUrl } from '../services/portals/securityHttpClient';

const router = Router();

// GET /api/v1/portals
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query('SELECT * FROM whitelisted_portals ORDER BY is_featured DESC, name ASC');
    const formatted = rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      url: p.url,
      category: p.category,
      icon: p.icon,
      isFeatured: p.is_featured,
      notes: p.notes,
      allowedDomains: Array.isArray(p.allowed_domains) ? p.allowed_domains : [],
      status: p.status || 'DRAFT',
      integrationMethod: p.integration_method || 'NONE',
      capabilities: p.capabilities || {
        searchSupported: false,
        recordLookupSupported: false,
        canonicalUrlsSupported: false,
        metadataSupported: false,
        fullTextSupported: false,
        verificationSupported: false,
      },
      lastVerifiedAt: p.last_verified_at,
      healthStatus: p.health_status || 'UNKNOWN',
      discoveryDetails: p.discovery_details || {},
    }));
    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/portals/discover-preview - Probe target URL before creation
router.post('/discover-preview', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { url, allowedDomains } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'رابط البوابة مطلوب.' } });
  }

  try {
    // Validate safe URL and protocol
    validateSafeUrl(url, {
      allowedDomains,
      allowLocalhost: process.env.NODE_ENV === 'test',
    });

    const discovery = await PortalManager.discoverPreview(url, allowedDomains);
    res.json({ success: true, data: discovery });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'DISCOVERY_ERROR', message: err.message },
    });
  }
});

// POST /api/v1/portals/verify-record - Live record verification
router.post('/verify-record', optionalAuth, async (req: Request, res: Response) => {
  const { portalId, recordUrl, title, author, recordId } = req.body;

  if (!recordUrl) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'رابط السجل مطلوب.' } });
  }

  try {
    let result;
    if (portalId) {
      result = await PortalManager.verifyRecord(portalId, {
        id: recordId,
        recordUrl,
        title,
        author,
      });
    } else {
      result = await VerificationService.verifyUrl(recordUrl, {
        expectedTitle: title,
        expectedAuthor: author,
        allowLocalhost: process.env.NODE_ENV === 'test',
      });
    }

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'VERIFICATION_ERROR', message: err.message } });
  }
});

// GET /api/v1/portals/:id/search - Strictly source-bound search
router.get('/:id/search', optionalAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { q = '', category = 'all', limit = 20 } = req.query;

  try {
    // Check if portal is verified or active
    const { rows } = await db.query('SELECT * FROM whitelisted_portals WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'البوابة غير موجودة.' } });
    }

    const portal = rows[0];
    if (
      portal.status === 'UNSUPPORTED' ||
      portal.status === 'BLOCKED' ||
      portal.status === 'BROWSE_ONLY' ||
      portal.integration_method === 'BROWSE_ONLY'
    ) {
      return res.json({
        success: true,
        data: [],
        portalStatus: portal.status,
        isBrowseOnly: true,
        message: `البوابة بحالة (${portal.status}) مخصصة للتصفح المباشر فقط ولا تدعم البحث الآلي بالمستكشف.`,
      });
    }

    const results = await PortalManager.searchPortal(id, String(q), {
      categoryFilter: String(category),
      limit: Number(limit),
    });

    res.json({
      success: true,
      data: results,
      total: results.length,
      provenancePortalId: id,
      isStaticSnapshot:
        portal.integration_method === 'STATIC_VERIFIED_SNAPSHOT' ||
        portal.integration_method === 'MANUAL_VERIFIED_CATALOG',
      isLiveSearch: [
        'OFFICIAL_API',
        'LIVE_OFFICIAL_API',
        'OAI_PMH',
        'LIVE_OAI_PMH',
        'OFFICIAL_SEARCH_ENDPOINT',
        'LIVE_OFFICIAL_SEARCH',
      ].includes(portal.integration_method),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SEARCH_ERROR', message: err.message } });
  }
});

// POST /api/v1/portals/:id/run-tests - Run the 12 onboarding tests
router.post('/:id/run-tests', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const report = await PortalManager.testPortal(id);
    PortalManager.invalidateCache(id);
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'TEST_SUITE_ERROR', message: err.message } });
  }
});

// POST /api/v1/portals/:id/verify-status - Update status with strict verification policy
router.post('/:id/verify-status', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const { rows } = await db.query('SELECT * FROM whitelisted_portals WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'البوابة غير موجودة.' } });
    }

    const portal = rows[0];

    // INVARIANT: Cannot set to VERIFIED if discovery_details or capabilities show failure
    if (status === 'VERIFIED') {
      const details = portal.discovery_details || {};
      const report = details.report;

      // If no report or report shows failure, require test suite pass
      if (!report || report.allPassed === false) {
        // Run test suite now to verify
        const testReport = await PortalManager.testPortal(id);
        if (!testReport.allPassed && testReport.suggestedStatus !== 'VERIFIED') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VERIFICATION_POLICY_VIOLATION',
              message: 'لا يمكن اعتماد البوابة كـ VERIFIED لأنها لم تجتز الاختبارات الفنية الإلزامية.',
              details: testReport.failureReason,
            },
          });
        }
      }
    }

    await db.query(
      'UPDATE whitelisted_portals SET status = $1, last_verified_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, id]
    );

    PortalManager.invalidateCache(id);
    res.json({ success: true, data: { message: `تم تحديث حالة البوابة إلى ${status} بنجاح.` } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/portals - Create new portal in DRAFT / DISCOVERING mode
router.post('/', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const {
    name,
    description,
    url,
    category,
    icon = 'Globe',
    isFeatured = true,
    notes,
    allowedDomains = [],
    autoTest = true,
  } = req.body;

  const id = `portal-${Date.now()}`;

  try {
    // Validate target URL
    const parsed = validateSafeUrl(url, {
      allowedDomains,
      allowLocalhost: process.env.NODE_ENV === 'test',
    });

    const effectiveDomains =
      allowedDomains.length > 0 ? allowedDomains : [parsed.hostname];

    const effectiveCategory =
      category && typeof category === 'string' && category.trim().length > 0
        ? category.trim()
        : 'المصادر والأبحاث الرقمية';

    // Initial insert with DRAFT status
    await db.query(
      `
      INSERT INTO whitelisted_portals (
        id, name, description, url, category, icon, is_featured, notes, allowed_domains,
        status, integration_method, capabilities, health_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'DRAFT', 'NONE', $10, 'UNKNOWN')
    `,
      [
        id,
        name,
        description || '',
        url,
        effectiveCategory,
        icon,
        isFeatured,
        notes || null,
        effectiveDomains,
        JSON.stringify({
          searchSupported: false,
          recordLookupSupported: false,
          canonicalUrlsSupported: false,
          metadataSupported: false,
          fullTextSupported: false,
          verificationSupported: false,
        }),
      ]
    );

    let testReport = null;
    if (autoTest) {
      // Run technical onboarding test suite immediately
      try {
        testReport = await PortalManager.testPortal(id);
      } catch (tErr: any) {
        console.warn(`[PortalManager] Initial auto-test warning for ${id}:`, tErr.message);
      }
    }

    const { rows: createdRows } = await db.query('SELECT * FROM whitelisted_portals WHERE id = $1', [id]);
    const created = createdRows[0];

    res.status(201).json({
      success: true,
      data: {
        id: created.id,
        name: created.name,
        description: created.description,
        url: created.url,
        category: created.category,
        icon: created.icon,
        isFeatured: created.is_featured,
        notes: created.notes,
        allowedDomains: created.allowed_domains,
        status: created.status,
        integrationMethod: created.integration_method,
        capabilities: created.capabilities,
        healthStatus: created.health_status,
        testReport,
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'CREATION_ERROR', message: err.message } });
  }
});

// PUT /api/v1/portals/:id
router.put('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, url, category, icon, isFeatured, notes, allowedDomains, status, integrationMethod } = req.body;

  try {
    if (url) {
      validateSafeUrl(url, {
        allowedDomains,
        allowLocalhost: process.env.NODE_ENV === 'test',
      });
    }

    await db.query(
      `
      UPDATE whitelisted_portals SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        url = COALESCE($3, url),
        category = COALESCE($4, category),
        icon = COALESCE($5, icon),
        is_featured = COALESCE($6, is_featured),
        notes = COALESCE($7, notes),
        allowed_domains = COALESCE($8, allowed_domains),
        status = COALESCE($9, status),
        integration_method = COALESCE($10, integration_method)
      WHERE id = $11
    `,
      [name, description, url, category, icon, isFeatured, notes, allowedDomains, status, integrationMethod, id]
    );

    PortalManager.invalidateCache(id);
    res.json({ success: true, data: { message: 'تم تحديث بوابة المكتبة بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/portals/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM whitelisted_portals WHERE id = $1', [id]);
    PortalManager.invalidateCache(id);
    res.json({ success: true, data: { message: 'تم حذف البوابة بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
