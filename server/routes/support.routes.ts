import path from 'path';
import { Router, Request, Response } from 'express';
import { supportAgentService } from '../services/supportAgentService';
import { updaterService } from '../services/updaterService';
import { serverConfig } from '../config';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

export const supportRouter = Router();
export const clientEventsRouter = Router();

// =========================================================================
// 1. Client Events API (Student Station Telemetry Ingestion)
// Accessible by student clients over local LAN without admin authentication
// =========================================================================

// POST /api/v1/client-events
clientEventsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const rawEvents = Array.isArray(req.body) ? req.body : [req.body];
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';

    const result = await supportAgentService.ingestClientEvents(rawEvents, clientIp);

    return res.status(200).json({
      success: true,
      data: {
        ingestedCount: result.ingestedCount,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('⚠️ [SupportRoutes] Ingestion error:', err.message);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to ingest client events', details: err.message },
    });
  }
});

// POST /api/v1/client-events/heartbeat
clientEventsRouter.post('/heartbeat', async (req: Request, res: Response) => {
  try {
    const { clientId, machineName, appVersion, osVersion } = req.body;
    if (!clientId) {
      return res.status(400).json({ success: false, error: { message: 'clientId is required' } });
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
    await supportAgentService.recordClientHeartbeat({
      clientId,
      machineName,
      appVersion: appVersion || '1.0.0',
      osVersion,
    }, clientIp);

    return res.status(200).json({
      success: true,
      data: { acknowledged: true, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to record heartbeat', details: err.message },
    });
  }
});

// =========================================================================
// 2. Support Agent & Diagnostic Endpoints (Admin Only)
// =========================================================================

// GET /api/v1/support/health-summary
supportRouter.get('/health-summary', authenticateToken, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const health = await supportAgentService.getServerHealth();
    const students = await supportAgentService.getConnectedClientsSummary();

    return res.status(200).json({
      success: true,
      data: {
        health,
        students: {
          connectedNowCount: students.connectedNowCount,
          seenTodayCount: students.seenTodayCount,
          totalRegisteredCount: students.totalRegisteredCount,
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch health summary', details: err.message },
    });
  }
});

// GET /api/v1/support/aggregated-errors
supportRouter.get('/aggregated-errors', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const errors = await supportAgentService.getAggregatedErrors(limit);

    return res.status(200).json({
      success: true,
      data: errors,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch aggregated errors', details: err.message },
    });
  }
});

// GET /api/v1/support/clients
supportRouter.get('/clients', authenticateToken, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const summary = await supportAgentService.getConnectedClientsSummary();

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to list connected clients', details: err.message },
    });
  }
});

// GET /api/v1/support/recent-events
supportRouter.get('/recent-events', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const events = await supportAgentService.getRecentEvents(limit);

    return res.status(200).json({
      success: true,
      data: events,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch recent events', details: err.message },
    });
  }
});

// GET /api/v1/support/outbound-queue
supportRouter.get('/outbound-queue', authenticateToken, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const summary = await supportAgentService.getOutboundQueueSummary();
    return res.status(200).json({ success: true, data: summary });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch outbound queue summary', details: err.message },
    });
  }
});

// POST /api/v1/support/flush-queue
supportRouter.post('/flush-queue', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const endpoint = req.body?.endpoint;
    // Always force retry when explicitly invoked by admin from dashboard
    const result = await supportAgentService.flushOutboundQueue(endpoint, true);
    const summary = await supportAgentService.getOutboundQueueSummary();
    return res.status(200).json({
      success: true,
      data: {
        sent: result.sent,
        failed: result.failed,
        summary,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to flush outbound queue', details: err.message },
    });
  }
});

// GET /api/v1/support/endpoint
supportRouter.get('/endpoint', authenticateToken, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const url = await supportAgentService.getSupportApiUrl();
    const identity = supportAgentService.getInstitutionIdentity();
    return res.status(200).json({
      success: true,
      data: {
        supportApiUrl: url,
        institutionId: identity.institutionId,
        installationId: identity.installationId,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to get support endpoint configuration', details: err.message },
    });
  }
});

// POST /api/v1/support/endpoint
supportRouter.post('/endpoint', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { supportApiUrl } = req.body;
    if (!supportApiUrl || typeof supportApiUrl !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'supportApiUrl is required' },
      });
    }
    const result = await supportAgentService.setSupportApiUrl(supportApiUrl);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to set support endpoint', details: err.message },
    });
  }
});

// POST /api/v1/support/test-connection
supportRouter.post('/test-connection', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const endpoint = req.body?.endpoint;
    const testResult = await supportAgentService.testSupportConnection(endpoint);
    return res.status(200).json({
      success: true,
      data: testResult,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Test connection failed', details: err.message },
    });
  }
});

// POST /api/v1/support/report-problem (Admin direct problem report with screenshot)
supportRouter.post('/report-problem', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { problemDescription, screen, screenshot, diagnosticInfo } = req.body;
    if (!problemDescription || !problemDescription.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'problemDescription is required' },
      });
    }

    const reportId = await supportAgentService.enqueueOutboundReport({
      sourceType: 'server',
      clientDeviceId: 'SERVER-ADMIN',
      userRole: 'admin',
      component: screen || 'SystemSupportDashboard',
      errorType: 'manual_report',
      errorCode: 'ADMIN_REPORTED_PROBLEM',
      severity: 'info',
      message: problemDescription.trim(),
      diagnosticContext: {
        screen: screen || 'SystemSupportDashboard',
        adminUser: (req as any).user?.name || (req as any).user?.username || 'admin',
        adminId: (req as any).user?.id,
        screenshot: screenshot || null,
        ...(diagnosticInfo || {}),
      },
    });

    // Opportunistically flush immediately to developer support hub
    supportAgentService.flushOutboundQueue().catch(() => {});

    return res.status(200).json({
      success: true,
      data: { reportId, acknowledged: true },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to report problem', details: err.message },
    });
  }
});

// =========================================================================
// 3. MISHKAT Updater Endpoints (Admin Only)
// =========================================================================

// GET /api/v1/support/updater/status
supportRouter.get('/updater/status', authenticateToken, requireRole('admin'), (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    data: updaterService.getStatus(),
  });
});

// POST /api/v1/support/updater/check
supportRouter.post('/updater/check', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const feedUrl = req.body?.feedUrl;
    const result = await updaterService.checkForUpdates(feedUrl);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Check for updates failed', details: err.message },
    });
  }
});

// POST /api/v1/support/updater/apply
supportRouter.post('/updater/apply', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { downloadUrl, expectedSha256 } = req.body;
    if (!downloadUrl || !expectedSha256) {
      return res.status(400).json({
        success: false,
        error: { message: 'downloadUrl and expectedSha256 are required to apply update' },
      });
    }

    const targetZipPath = path.join(serverConfig.dirs.temp, `mishkat-update-${Date.now()}.zip`);

    // Download the ZIP first
    await updaterService.downloadReleasePackage(downloadUrl, targetZipPath);

    const result = await updaterService.applyCertifiedUpdate(targetZipPath, expectedSha256);

    return res.status(result.success ? 200 : 500).json({
      success: result.success,
      data: result,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to apply update', details: err.message },
    });
  }
});
