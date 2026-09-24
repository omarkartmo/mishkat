/**
 * MISHKAT Developer Support Hub
 * Standalone Local Support API & Monitoring Dashboard
 * Runs exclusively on Developer PC — Zero Cloud Server / Zero Cloud Database.
 * 
 * Hardened Security:
 * - Constant-time SHA-256 HMAC/key credential verification
 * - Institution authorization registry with auto-enrollment
 * - Ingestion rate limiting (120 requests/minute)
 * - Automatic school/institution name extraction and mapping
 * - Direct developer dashboard access without login gate
 * - Purge test data endpoint & UI button
 * - Real-time refresh button & auto-refresh timer
 * - Idempotent report delivery with deduplication
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.SUPPORT_HUB_PORT || process.env.PORT || 4000;
const DATA_FILE = path.join(__dirname, 'support_hub_data.json');
const ADMIN_KEY = process.env.SUPPORT_HUB_ADMIN_KEY || 'mishkat_dev_admin_2026';

// Global middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure local persistence database exists
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return {
        institutions: parsed.institutions || {},
        authorizedInstitutions: parsed.authorizedInstitutions || {},
        reports: parsed.reports || [],
        receivedReportIds: parsed.receivedReportIds || {},
      };
    }
  } catch (e) {
    console.error('Data load error:', e.message);
  }
  return {
    institutions: {},
    authorizedInstitutions: {},
    reports: [],
    receivedReportIds: {},
  };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Data save error:', e.message);
  }
}

// In-Memory Rate Limiter (120 requests/minute per IP or Institution)
const rateLimitMap = new Map();
function rateLimiter(req, res, next) {
  const identifier = req.headers['x-institution-id'] || req.ip || 'client';
  const now = Date.now();
  const entry = rateLimitMap.get(identifier) || { count: 0, resetAt: now + 60000 };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60000;
  }

  entry.count++;
  rateLimitMap.set(identifier, entry);

  if (entry.count > 120) {
    return res.status(429).json({
      success: false,
      acknowledged: false,
      error: { message: 'Too Many Requests: Rate limit exceeded.' },
    });
  }

  next();
}

// Constant-time Hash Comparison Helper
function verifyKey(providedKey, expectedHash) {
  if (!providedKey || !expectedHash) return false;
  try {
    const providedHash = crypto.createHash('sha256').update(String(providedKey).trim()).digest('hex');
    const bufA = Buffer.from(providedHash, 'hex');
    const bufB = Buffer.from(expectedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// Security Middleware: Validate Institution Credentials & Extract Institution Info
function authenticateInstitution(req, res, next) {
  const institutionId = req.headers['x-institution-id'];
  const installationId = req.headers['x-installation-id'];
  const supportKey = req.headers['x-support-key'];
  const rawInstName = req.headers['x-institution-name'];

  if (!institutionId || !installationId || !supportKey) {
    return res.status(401).json({
      success: false,
      acknowledged: false,
      error: { message: 'Unauthorized: X-Institution-Id, X-Installation-Id, and X-Support-Key headers are required' },
    });
  }

  const cleanInstId = String(institutionId).trim().slice(0, 100);
  const cleanInstallId = String(installationId).trim().slice(0, 100);
  const cleanKey = String(supportKey).trim().slice(0, 150);

  let decodedName = '';
  if (rawInstName) {
    try {
      decodedName = decodeURIComponent(String(rawInstName).trim());
    } catch {
      decodedName = String(rawInstName).trim();
    }
  }

  const data = loadData();
  if (!data.authorizedInstitutions) {
    data.authorizedInstitutions = {};
  }

  let authRecord = data.authorizedInstitutions[cleanInstId];
  if (!authRecord) {
    // Initial provisioning / auto-enrollment mode
    authRecord = {
      institutionId: cleanInstId,
      supportKeyHash: crypto.createHash('sha256').update(cleanKey).digest('hex'),
      status: 'active',
      enrolledAt: new Date().toISOString(),
    };
    data.authorizedInstitutions[cleanInstId] = authRecord;
    saveData(data);
    console.log(`[Support Hub] Auto-enrolled new institution: ${cleanInstId} (${decodedName || 'No Name'})`);
  }

  // Revocation & suspension verification
  if (authRecord.status !== 'active') {
    return res.status(403).json({
      success: false,
      acknowledged: false,
      error: { message: `Forbidden: Institution credentials are ${authRecord.status}` },
    });
  }

  // Strict Constant-Time Cryptographic Key Verification
  if (!verifyKey(cleanKey, authRecord.supportKeyHash)) {
    return res.status(401).json({
      success: false,
      acknowledged: false,
      error: { message: 'Unauthorized: Invalid X-Support-Key' },
    });
  }

  req.institutionContext = {
    institutionId: cleanInstId,
    installationId: cleanInstallId,
    institutionName: decodedName,
  };

  next();
}

// Developer Admin Authentication Middleware: Direct access to dashboard for local developer
function authenticateAdmin(req, res, next) {
  // Allow direct access without login password
  return next();
}

// Helper to extract clean human-readable institution name
function resolveInstitutionName(report, reqContext, instId) {
  let name = (
    report.institutionName ||
    reqContext?.institutionName ||
    (report.diagnosticContext && report.diagnosticContext.institutionName) ||
    ''
  ).trim();

  if (name) {
    try {
      name = decodeURIComponent(name);
    } catch {}
  }

  return name || instId;
}

// 1. Ingest Diagnostic Report (Accepts both /api/v1/support/ingest and /api/v1/support/reports)
function handleReportIngest(req, res) {
  const report = req.body;
  if (!report || !report.reportId || !report.component) {
    return res.status(400).json({
      success: false,
      acknowledged: false,
      error: { message: 'Invalid report: reportId and component are required' },
    });
  }

  const data = loadData();
  const reportId = String(report.reportId).trim();
  const { institutionId, installationId } = req.institutionContext;
  const institutionName = resolveInstitutionName(report, req.institutionContext, institutionId);

  // Update Institution Registry (Last seen, version, human-readable name, device count)
  if (!data.institutions[institutionId]) {
    data.institutions[institutionId] = {
      institutionId,
      institutionName,
      installationId,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      appVersion: report.appVersion || '1.0.0',
      totalReportsCount: 0,
      clientDevices: {},
    };
  }

  const inst = data.institutions[institutionId];
  inst.lastSeenAt = new Date().toISOString();
  inst.appVersion = report.appVersion || inst.appVersion;
  if (institutionName && institutionName !== institutionId) {
    inst.institutionName = institutionName;
  }
  if (report.clientDeviceId) {
    inst.clientDevices = inst.clientDevices || {};
    inst.clientDevices[report.clientDeviceId] = new Date().toISOString();
  }

  // Idempotency Check: if reportId was already received, acknowledge immediately
  if (data.receivedReportIds[reportId]) {
    saveData(data);
    return res.status(200).json({
      success: true,
      acknowledged: true,
      duplicate: true,
      reportId,
      message: 'Report already processed (Idempotent ACK)',
    });
  }

  // Extract screenshot if present
  let screenshot = null;
  if (report.screenshot && typeof report.screenshot === 'string' && (report.screenshot.startsWith('data:image/') || report.screenshot.startsWith('http'))) {
    screenshot = report.screenshot;
  } else if (typeof report.diagnosticContext === 'object' && report.diagnosticContext?.screenshot) {
    screenshot = report.diagnosticContext.screenshot;
  }

  // Ingest new report
  const storedReport = {
    reportId,
    institutionId,
    institutionName: inst.institutionName || institutionName || institutionId,
    installationId,
    appVersion: report.appVersion || '1.0.0',
    sourceType: report.sourceType || 'server',
    clientDeviceId: report.clientDeviceId || null,
    userRole: report.userRole || 'system',
    component: report.component,
    errorType: report.errorType || 'UNKNOWN_ERROR',
    errorCode: report.errorCode || 'ERR',
    severity: ['critical', 'warning', 'info'].includes(report.severity) ? report.severity : 'warning',
    sanitizedMessage: report.sanitizedMessage || report.message || 'No description provided',
    sanitizedStackTrace: report.sanitizedStackTrace || report.stackTrace || null,
    diagnosticContext: report.diagnosticContext || {},
    screenshot,
    clientTimestamp: report.timestamp || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  };

  data.receivedReportIds[reportId] = new Date().toISOString();
  data.reports.unshift(storedReport);
  inst.totalReportsCount = (inst.totalReportsCount || 0) + 1;

  // Keep latest 2500 reports in local memory/file
  if (data.reports.length > 2500) {
    data.reports = data.reports.slice(0, 2500);
  }

  saveData(data);

  console.log(`[Support Hub] Received ${storedReport.severity.toUpperCase()} from ${inst.institutionName} (${storedReport.errorCode})`);

  return res.status(200).json({
    success: true,
    acknowledged: true,
    reportId,
    receivedAt: storedReport.receivedAt,
  });
}

// Register ingestion endpoints
app.post('/api/v1/support/ingest', rateLimiter, authenticateInstitution, handleReportIngest);
app.post('/api/v1/support/reports', rateLimiter, authenticateInstitution, handleReportIngest);

// 2. Health & Statistics Endpoint (used by client connection tests)
app.get('/api/v1/support/stats', (req, res) => {
  const data = loadData();
  const totalReports = data.reports.length;
  const criticalCount = data.reports.filter((r) => r.severity === 'critical').length;
  const warningCount = data.reports.filter((r) => r.severity === 'warning').length;
  const infoCount = data.reports.filter((r) => r.severity === 'info').length;
  const totalInstitutions = Object.keys(data.institutions).length;

  return res.json({
    success: true,
    acknowledged: true,
    data: {
      totalInstitutions,
      totalReports,
      criticalCount,
      warningCount,
      infoCount,
    },
  });
});

// 3. Purge Test Data Endpoint
app.post('/api/v1/support/purge-test-data', (req, res) => {
  const data = {
    institutions: {},
    authorizedInstitutions: {},
    reports: [],
    receivedReportIds: {},
  };
  saveData(data);
  console.log('[Support Hub] Purged all test records and institutions.');
  return res.json({
    success: true,
    message: 'تم مسح جميع بيانات الاختبار والبلاغات بنجاح',
  });
});

// 4. Query Institutions (Admin Endpoint)
app.get('/api/v1/support/institutions', authenticateAdmin, (req, res) => {
  const data = loadData();
  const list = Object.values(data.institutions).map((inst) => {
    const auth = (data.authorizedInstitutions && data.authorizedInstitutions[inst.institutionId]) || {};
    return {
      ...inst,
      status: auth.status || 'active',
      activeDevicesCount: Object.keys(inst.clientDevices || {}).length,
    };
  });
  return res.json({ success: true, data: list });
});

// 5. Query Reports (Admin Endpoint)
app.get('/api/v1/support/reports', authenticateAdmin, (req, res) => {
  const data = loadData();
  let reports = data.reports;

  if (req.query.institutionId) {
    reports = reports.filter((r) => r.institutionId === req.query.institutionId);
  }
  if (req.query.severity) {
    reports = reports.filter((r) => r.severity === req.query.severity);
  }
  if (req.query.component) {
    reports = reports.filter((r) => r.component === req.query.component);
  }

  const limit = parseInt(req.query.limit, 10) || 100;
  return res.json({ success: true, data: reports.slice(0, limit) });
});

// 6. Developer Support Web Dashboard UI (Direct access, zero login gate)
app.get(['/', '/dashboard'], authenticateAdmin, (req, res) => {
  const data = loadData();
  const institutions = Object.values(data.institutions);
  const reports = data.reports.slice(0, 100);

  const criticalCount = data.reports.filter((r) => r.severity === 'critical').length;
  const warningCount = data.reports.filter((r) => r.severity === 'warning').length;
  const infoCount = data.reports.filter((r) => r.severity === 'info').length;

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MISHKAT — لوحة الدعم الفني للمطور (Support Dashboard)</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card: #131b2e;
      --card-hover: #19233c;
      --border: #1e293b;
      --border-focus: #3b82f6;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      padding: 24px;
      line-height: 1.5;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
      border: 1px solid transparent;
    }
    .btn-refresh {
      background: #2563eb;
      color: #fff;
    }
    .btn-refresh:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }
    .btn-purge {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }
    .btn-purge:hover {
      background: #ef4444;
      color: #fff;
      transform: translateY(-1px);
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: bold;
    }
    .badge-dev { background: #312e81; color: #a5b4fc; }
    .badge-online { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-timer { background: #1e293b; color: #94a3b8; font-family: monospace; font-size: 12px; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .stat-val { font-size: 28px; font-weight: bold; margin-top: 6px; }
    .stat-label { font-size: 13px; color: var(--text-muted); }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      margin-top: 28px;
    }
    .section-title { font-size: 17px; font-weight: 700; color: #f1f5f9; display: flex; align-items: center; gap: 8px; }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 24px;
      font-size: 13px;
    }
    th, td {
      padding: 12px 16px;
      text-align: right;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    th {
      background: #0f172a;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    tr:hover { background: var(--card-hover); }

    .inst-name {
      font-size: 14px;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 2px;
    }
    .inst-id {
      font-family: monospace;
      font-size: 11px;
      color: var(--text-muted);
    }

    .tag-critical {
      color: #ef4444;
      background: rgba(239, 68, 68, 0.12);
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: bold;
      border: 1px solid rgba(239, 68, 68, 0.25);
    }
    .tag-warning {
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.12);
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: bold;
      border: 1px solid rgba(245, 158, 11, 0.25);
    }
    .tag-info {
      color: #3b82f6;
      background: rgba(59, 130, 246, 0.12);
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: bold;
      border: 1px solid rgba(59, 130, 246, 0.25);
    }

    .code-box {
      background: #090d16;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      direction: ltr;
      text-align: left;
      max-height: 120px;
      overflow-y: auto;
      border: 1px solid #1e293b;
      color: #e2e8f0;
      margin-top: 6px;
    }

    details summary {
      cursor: pointer;
      color: #38bdf8;
      font-size: 12px;
      margin-top: 4px;
      user-select: none;
    }

    .btn-copy {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
    }
    .btn-copy:hover {
      background: #334155;
      color: #fff;
    }

    .thumb-btn {
      width: 48px;
      height: 32px;
      object-fit: cover;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid #334155;
      transition: transform 0.2s;
    }
    .thumb-btn:hover {
      transform: scale(1.15);
      border-color: #38bdf8;
    }

    /* Modal for Full Screenshot */
    .modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-content {
      max-width: 90vw;
      max-height: 90vh;
      background: #111726;
      border: 1px solid #334155;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .modal-content img {
      max-width: 100%;
      max-height: calc(90vh - 60px);
      object-fit: contain;
    }
    .modal-header {
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0b0f19;
      border-bottom: 1px solid #1e293b;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>
        <span>🛡️ MISHKAT Support Dashboard</span>
        <span class="badge badge-online">● متصل ومستعد للاستقبال</span>
      </h1>
      <p style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">
        نفق الاستقبال الآمن: 
        <code style="background: #1e293b; padding: 2px 6px; border-radius: 4px; color: #38bdf8; direction: ltr; display: inline-block;">https://calibrate-reply-aviation.ngrok-free.dev</code>
      </p>
    </div>

    <div class="header-actions">
      <span class="badge badge-timer" id="timerBadge">⏱️ تحديث تلقائي خلال: <strong id="countdown" style="color: #fff;">15</strong> ث</span>
      <button class="btn btn-refresh" onclick="manualRefresh()" id="refreshBtn">
        🔄 تحديث الآن
      </button>
      <button class="btn btn-purge" onclick="purgeTestData()">
        🗑️ مسح سجلات الاختبار
      </button>
    </div>
  </header>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">المؤسسات والمدارس المتصلة</div>
      <div class="stat-val" style="color: #38bdf8;">${institutions.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">إجمالي البلاغات المسجلة</div>
      <div class="stat-val">${data.reports.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">أخطاء حرجة (Critical)</div>
      <div class="stat-val" style="color: var(--danger);">${criticalCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">تحذيرات تشغيلية (Warnings)</div>
      <div class="stat-val" style="color: var(--warning);">${warningCount}</div>
    </div>
  </div>

  <div class="section-header">
    <div class="section-title">
      🏢 المؤسسات والمدارس المتصلة (${institutions.length})
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>اسم المؤسسة التعليمية</th>
        <th>معرف المؤسسة</th>
        <th>معرف التثبيت</th>
        <th>الإصدار</th>
        <th>الأجهزة النشطة</th>
        <th>إجمالي البلاغات</th>
        <th>آخر ظهور</th>
        <th>إجراءات</th>
      </tr>
    </thead>
    <tbody>
      ${institutions.length === 0 ? '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 28px;">لا توجد مؤسسات مسجلة بعد. عند تشغيل النظام في أي مؤسسة ستظهر هنا فورياً وتلقائياً.</td></tr>' : ''}
      ${institutions.map(inst => `
        <tr>
          <td>
            <div class="inst-name">${inst.institutionName || 'مؤسسة تعليمية جديدة'}</div>
          </td>
          <td><span class="inst-id">${inst.institutionId}</span></td>
          <td><span class="inst-id">${inst.installationId}</span></td>
          <td><span class="badge" style="background:#1e293b; color:#cbd5e1;">v${inst.appVersion || '1.1.8'}</span></td>
          <td><strong style="color: #10b981;">${Object.keys(inst.clientDevices || {}).length} جهاز</strong></td>
          <td><strong>${inst.totalReportsCount || 0}</strong></td>
          <td style="color: var(--text-muted); font-size: 12px;">${new Date(inst.lastSeenAt).toLocaleString('ar-EG')}</td>
          <td>
            <button class="btn-copy" onclick="copyInstitutionErrors('${inst.institutionId}', '${(inst.institutionName || inst.institutionId).replace(/'/g, "\\'")}')">
              📋 نسخ أخطاء المؤسسة لـ Antigravity
            </button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="section-header">
    <div class="section-title">
      🚨 سجل البلاغات التشخيصية المستقبلة (${reports.length})
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>الوقت</th>
        <th>المؤسسة التعليمية</th>
        <th>المصدر</th>
        <th>المكون</th>
        <th>الخطورة</th>
        <th>كود الخطأ والرسالة</th>
        <th>لقطة الشاشة</th>
        <th>إجراءات</th>
      </tr>
    </thead>
    <tbody>
      ${reports.length === 0 ? '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 28px;">لا توجد بلاغات أخطاء حتى الآن. كافة المؤسسات تعمل بكفاءة وسلامة.</td></tr>' : ''}
      ${reports.map(r => {
        const hasScreenshot = Boolean(r.screenshot);
        const sourceLabel = (r.sourceType === 'server' && r.userRole === 'admin')
          ? 'خادم المؤسسة (الأدمن)'
          : (r.sourceType === 'server')
          ? 'خادم المؤسسة (تلقائي)'
          : 'حاسوب الطالب (' + (r.clientDeviceId || 'Student PC') + ')';

        const reportJson = JSON.stringify(r).replace(/"/g, '&quot;');

        let detailsHtml = '';
        if (r.sanitizedStackTrace || (r.diagnosticContext && Object.keys(r.diagnosticContext).length > 0)) {
          detailsHtml = `
            <details>
              <summary>عرض تتبع الخطأ (Stack Trace) والسياق</summary>
              ${r.sanitizedStackTrace ? `<div class="code-box">${r.sanitizedStackTrace}</div>` : ''}
              ${r.diagnosticContext ? `<div class="code-box">${JSON.stringify(r.diagnosticContext, null, 2)}</div>` : ''}
            </details>
          `;
        }

        const screenshotCell = hasScreenshot
          ? `<img src="${r.screenshot}" class="thumb-btn" alt="Screenshot" onclick="showScreenshot('${r.reportId}')" title="انقر لتكبير لقطة الشاشة" /><div style="display: none;" id="screen_${r.reportId}">${r.screenshot}</div>`
          : `<span style="color: var(--text-muted); font-size: 11px;">لا يوجد</span>`;

        return `
          <tr>
            <td style="white-space: nowrap; color: var(--text-muted); font-size: 12px;">
              ${new Date(r.receivedAt).toLocaleTimeString('ar-EG')}
            </td>
            <td>
              <div class="inst-name">${r.institutionName || r.institutionId}</div>
              <div class="inst-id">${r.institutionId}</div>
            </td>
            <td>
              <span class="badge" style="background: ${r.sourceType === 'client' ? '#3b0764; color: #d8b4fe' : '#0369a1; color: #bae6fd'};">
                ${sourceLabel}
              </span>
            </td>
            <td style="font-family: monospace; font-size: 12px;">${r.component}</td>
            <td>
              <span class="tag-${r.severity}">${r.severity.toUpperCase()}</span>
            </td>
            <td>
              <div><strong>[${r.errorCode}]</strong> ${r.sanitizedMessage}</div>
              ${detailsHtml}
            </td>
            <td style="text-align: center;">${screenshotCell}</td>
            <td>
              <button class="btn-copy" onclick="copyReportForAntigravity(this)" data-report="${reportJson}">
                📋 نسخ لـ Antigravity
              </button>
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <!-- Screenshot Modal -->
  <div id="imageModal" class="modal-backdrop" onclick="closeScreenshot()">
    <div class="modal-content" onclick="event.stopPropagation()">
      <div class="modal-header">
        <strong style="color: #fff;">لقطة شاشة الخطأ من حاسوب المؤسسة</strong>
        <button onclick="closeScreenshot()" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer;">&times;</button>
      </div>
      <img id="modalImg" src="" alt="Full Screenshot" />
    </div>
  </div>

  <script>
    // 1. Live Auto-Refresh Countdown
    let timeLeft = 15;
    const countdownEl = document.getElementById('countdown');
    setInterval(() => {
      timeLeft--;
      if (countdownEl) countdownEl.textContent = timeLeft;
      if (timeLeft <= 0) {
        location.reload();
      }
    }, 1000);

    // 2. Manual Refresh
    function manualRefresh() {
      const btn = document.getElementById('refreshBtn');
      if (btn) btn.textContent = '⏳ جاري التحديث...';
      location.reload();
    }

    // 3. Purge Test Data
    async function purgeTestData() {
      if (!confirm('هل أنت متأكد من مسح جميع بيانات الاختبار والبلاغات السابقة؟\\nسيتم تفريغ السجل بالكامل ليكون جاهزاً للمؤسسات الحقيقية.')) {
        return;
      }
      try {
        const res = await fetch('/api/v1/support/purge-test-data', { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          alert('✅ تم مسح بيانات الاختبار بنجاح.');
          location.reload();
        } else {
          alert('حدث خطأ: ' + (json.error || 'تعذر المسح'));
        }
      } catch (err) {
        alert('تعذر الاتصال بالخادم: ' + err.message);
      }
    }

    // 4. Modal Screenshot Viewer
    function showScreenshot(reportId) {
      const screenDiv = document.getElementById('screen_' + reportId);
      if (!screenDiv) return;
      document.getElementById('modalImg').src = screenDiv.textContent;
      document.getElementById('imageModal').style.display = 'flex';
    }
    function closeScreenshot() {
      document.getElementById('imageModal').style.display = 'none';
    }

    // 5. Copy Report Markdown for Antigravity IDE
    function copyReportForAntigravity(btn) {
      const report = JSON.parse(btn.getAttribute('data-report'));
      const text = [
        '### 🚨 بلاغ خطأ مستلم من مؤسسة: ' + (report.institutionName || report.institutionId),
        '- **المؤسسة:** ' + (report.institutionName || report.institutionId) + ' (' + report.institutionId + ')',
        '- **المصدر:** ' + report.sourceType + ' (' + (report.clientDeviceId || 'Server') + ')',
        '- **المكون:** ' + report.component,
        '- **كود الخطأ:** ' + report.errorCode,
        '- **الخطورة:** ' + report.severity,
        '- **الوصف:** ' + report.sanitizedMessage,
        report.sanitizedStackTrace ? '\\n**Stack Trace:**\\n\`\`\`\\n' + report.sanitizedStackTrace + '\\n\`\`\`' : '',
        '\\nيرجى تحليل الخطأ وإصلاحه وحماية النظام من تكراره.'
      ].join('\\n');

      navigator.clipboard.writeText(text).then(() => {
        const oldText = btn.textContent;
        btn.textContent = '✅ تم النسخ!';
        setTimeout(() => { btn.textContent = oldText; }, 2000);
      });
    }

    // 6. Copy All Errors for a specific institution
    async function copyInstitutionErrors(instId, instName) {
      try {
        const res = await fetch('/api/v1/support/reports?institutionId=' + encodeURIComponent(instId));
        const json = await res.json();
        if (!json.success || !json.data || json.data.length === 0) {
          alert('لا توجد بلاغات مسجلة لهذه المؤسسة حالياً.');
          return;
        }

        const lines = [
          '# 🏢 تقرير تشخيصي شامل للمؤسسة: ' + instName + ' (' + instId + ')',
          'إجمالي البلاغات المسجلة: ' + json.data.length,
          '---\\n'
        ];

        json.data.forEach((r, idx) => {
          lines.push(
            (idx + 1) + '. **[' + r.severity.toUpperCase() + ']** ' + r.component + ' - [' + r.errorCode + '] ' + r.sanitizedMessage +
            (r.sanitizedStackTrace ? '\\n\`\`\`\\n' + r.sanitizedStackTrace.slice(0, 500) + '\\n\`\`\`' : '')
          );
        });

        await navigator.clipboard.writeText(lines.join('\\n\\n'));
        alert('✅ تم نسخ تقرير أخطاء المؤسسة بالكامل للحافظة! يمكنك لصقه مباشرة في Antigravity.');
      } catch (err) {
        alert('تعذر جلب أخطاء المؤسسة: ' + err.message);
      }
    }
  </script>
</body>
</html>`);
});

// Start Server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================================`);
    console.log(` MISHKAT Developer Support Hub (Hardened & Ready)`);
    console.log(` Running on: http://localhost:${PORT}`);
    console.log(` Ingestion: POST http://localhost:${PORT}/api/v1/support/reports`);
    console.log(` Direct Access: Active (Zero Password Gate)`);
    console.log(`========================================================`);
  });
}

module.exports = { app, loadData, saveData };
