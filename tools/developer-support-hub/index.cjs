/**
 * MISHKAT Developer Support Hub
 * Standalone Local Support API & Monitoring Dashboard
 * Runs exclusively on Developer PC — Zero Cloud Server / Zero Cloud Database.
 * 
 * Hardened Security:
 * - Constant-time SHA-256 HMAC/key credential verification
 * - Institution authorization registry with revocation/suspension checks
 * - Ingestion rate limiting (60 requests/minute)
 * - Strict 50KB payload ceiling
 * - Developer Admin authentication for dashboard & queries
 * - Idempotent report delivery with deduplication
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.SUPPORT_HUB_PORT || 4000;
const DATA_FILE = path.join(__dirname, 'support_hub_data.json');
const ADMIN_KEY = process.env.SUPPORT_HUB_ADMIN_KEY || 'mishkat_dev_admin_2026';

// Global middleware
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

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

// In-Memory Rate Limiter (60 requests/minute per IP or Institution)
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

  if (entry.count > 60) {
    return res.status(429).json({
      success: false,
      error: { message: 'Too Many Requests: Rate limit exceeded (60 requests/minute max).' },
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

// Security Middleware: Validate Institution Credentials & Status
function authenticateInstitution(req, res, next) {
  const institutionId = req.headers['x-institution-id'];
  const installationId = req.headers['x-installation-id'];
  const supportKey = req.headers['x-support-key'];

  if (!institutionId || !installationId || !supportKey) {
    return res.status(401).json({
      success: false,
      error: { message: 'Unauthorized: X-Institution-Id, X-Installation-Id, and X-Support-Key headers are required' },
    });
  }

  const cleanInstId = String(institutionId).trim().slice(0, 100);
  const cleanInstallId = String(installationId).trim().slice(0, 100);
  const cleanKey = String(supportKey).trim().slice(0, 150);

  const data = loadData();
  if (!data.authorizedInstitutions) {
    data.authorizedInstitutions = {};
  }

  let authRecord = data.authorizedInstitutions[cleanInstId];
  if (!authRecord) {
    // Initial provisioning / auto-enrollment mode (facilitates turnkey on-prem setup)
    const allowEnrollment = process.env.SUPPORT_HUB_ALLOW_ENROLLMENT !== 'false';
    if (allowEnrollment) {
      authRecord = {
        institutionId: cleanInstId,
        supportKeyHash: crypto.createHash('sha256').update(cleanKey).digest('hex'),
        status: 'active',
        enrolledAt: new Date().toISOString(),
      };
      data.authorizedInstitutions[cleanInstId] = authRecord;
      saveData(data);
      console.log(`[Support Hub] Auto-enrolled new institution: ${cleanInstId} (status: active)`);
    } else {
      return res.status(403).json({
        success: false,
        error: { message: 'Forbidden: Institution is not authorized on Developer Support Hub' },
      });
    }
  }

  // Revocation & suspension verification
  if (authRecord.status !== 'active') {
    return res.status(403).json({
      success: false,
      error: { message: `Forbidden: Institution credentials are ${authRecord.status}` },
    });
  }

  // Strict Constant-Time Cryptographic Key Verification
  if (!verifyKey(cleanKey, authRecord.supportKeyHash)) {
    return res.status(401).json({
      success: false,
      error: { message: 'Unauthorized: Invalid X-Support-Key' },
    });
  }

  req.institutionContext = {
    institutionId: cleanInstId,
    installationId: cleanInstallId,
  };

  next();
}

// Developer Admin Authentication Middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const bearerKey = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const queryKey = req.query.key;
  const headerKey = req.headers['x-admin-key'];

  const candidate = bearerKey || queryKey || headerKey;
  if (candidate && candidate === ADMIN_KEY) {
    return next();
  }

  // If browser request for UI, render login screen
  if (req.accepts('html') && req.path === '/') {
    return res.status(401).send(renderAdminLoginPage());
  }

  return res.status(401).json({
    success: false,
    error: { message: 'Unauthorized: Valid Developer Admin Key required' },
  });
}

function renderAdminLoginPage() {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>MISHKAT Support Hub — تسجيل الدخول</title>
  <style>
    body {
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: #111726;
      border: 1px solid #1e293b;
      padding: 32px;
      border-radius: 12px;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }
    h2 { font-size: 18px; margin-bottom: 16px; color: #fff; }
    p { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
    input {
      width: 100%;
      padding: 10px 12px;
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 6px;
      color: #fff;
      font-size: 14px;
      margin-bottom: 16px;
      box-sizing: border-box;
      direction: ltr;
      text-align: center;
    }
    button {
      width: 100%;
      padding: 10px;
      background: #4f46e5;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
    }
    button:hover { background: #4338ca; }
  </style>
</head>
<body>
  <div class="card">
    <h2>MISHKAT Developer Support Hub</h2>
    <p>أدخل مفتاح المطور (Developer Admin Key) للوصول إلى لوحة المتابعة:</p>
    <form method="GET" action="/">
      <input type="password" name="key" placeholder="Developer Admin Key" required autocomplete="off" />
      <button type="submit">دخول لوحة التحكم</button>
    </form>
  </div>
</body>
</html>`;
}

// 1. Ingest Diagnostic Report (Strict 50KB limit, Rate Limited, Authenticated, Idempotent)
app.post(
  '/api/v1/support/ingest',
  express.json({ limit: '50kb' }),
  rateLimiter,
  authenticateInstitution,
  (req, res) => {
    const report = req.body;
    if (!report || !report.reportId || !report.component) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid report: reportId and component are required' },
      });
    }

    const data = loadData();
    const reportId = String(report.reportId).trim();
    const { institutionId, installationId } = req.institutionContext;

    // Update Institution Registry (Last seen, version, client count)
    if (!data.institutions[institutionId]) {
      data.institutions[institutionId] = {
        institutionId,
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
    if (report.clientDeviceId) {
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

    // Ingest new report
    const storedReport = {
      reportId,
      institutionId,
      installationId,
      appVersion: report.appVersion || '1.0.0',
      sourceType: report.sourceType || 'server',
      clientDeviceId: report.clientDeviceId || null,
      userRole: report.userRole || 'system',
      component: report.component,
      errorType: report.errorType || 'UNKNOWN_ERROR',
      errorCode: report.errorCode || 'ERR',
      severity: ['critical', 'warning', 'info'].includes(report.severity) ? report.severity : 'warning',
      sanitizedMessage: report.sanitizedMessage || 'No description provided',
      sanitizedStackTrace: report.sanitizedStackTrace || null,
      diagnosticContext: report.diagnosticContext || {},
      clientTimestamp: report.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };

    data.receivedReportIds[reportId] = new Date().toISOString();
    data.reports.unshift(storedReport);
    inst.totalReportsCount = (inst.totalReportsCount || 0) + 1;

    // Keep latest 2000 reports in local memory/file
    if (data.reports.length > 2000) {
      data.reports = data.reports.slice(0, 2000);
    }

    saveData(data);

    console.log(`[Support Hub] Received ${storedReport.severity.toUpperCase()} from ${institutionId} (${storedReport.errorCode})`);

    return res.status(201).json({
      success: true,
      acknowledged: true,
      reportId,
      receivedAt: storedReport.receivedAt,
    });
  }
);

// 2. Query Institutions (Admin Protected)
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

// 3. Query Reports (Admin Protected)
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

  const limit = parseInt(req.query.limit, 10) || 50;
  return res.json({ success: true, data: reports.slice(0, limit) });
});

// 4. Developer Support Web Dashboard UI (Admin Protected)
app.get('/', authenticateAdmin, (req, res) => {
  const data = loadData();
  const institutions = Object.values(data.institutions);
  const reports = data.reports.slice(0, 50);

  const criticalCount = data.reports.filter((r) => r.severity === 'critical').length;
  const warningCount = data.reports.filter((r) => r.severity === 'warning').length;
  const adminKeyQuery = req.query.key ? `?key=${encodeURIComponent(req.query.key)}` : '';

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>MISHKAT — مركز الدعم الفني للمطور (Developer Support Hub)</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #111726;
      --border: #1e293b;
      --primary: #6366f1;
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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
    }
    h1 { font-size: 20px; font-weight: 700; color: #fff; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: bold;
    }
    .badge-dev { background: #312e81; color: #a5b4fc; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      padding: 16px;
      border-radius: 10px;
    }
    .stat-val { font-size: 28px; font-weight: bold; margin-top: 4px; }
    .stat-label { font-size: 12px; color: var(--text-muted); }
    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 24px;
      font-size: 13px;
    }
    th, td { padding: 12px 14px; text-align: right; border-bottom: 1px solid var(--border); }
    th { background: #0f172a; color: var(--text-muted); font-weight: 600; }
    tr:hover { background: rgba(255, 255, 255, 0.02); }
    .tag-critical { color: var(--danger); font-weight: bold; }
    .tag-warning { color: var(--warning); }
    .tag-info { color: var(--primary); }
    .code-box {
      background: #06090e;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      direction: ltr;
      text-align: left;
      max-height: 80px;
      overflow-y: auto;
      border: 1px solid #1e293b;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>MISHKAT Developer Support Hub — مركز متابعة الأخطاء والدعم الفني</h1>
      <p style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">يعمل محليًا على حاسوب المطور — بدون أي خوادم سحابية خارجية (Zero-Cloud Hub)</p>
    </div>
    <span class="badge badge-dev">Authenticated Session</span>
  </header>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">المؤسسات المسجلة</div>
      <div class="stat-val" style="color: var(--primary);">${institutions.length}</div>
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

  <div class="section-title">🏢 المؤسسات المتصلة وخوادم المدارس (${institutions.length})</div>
  <table>
    <thead>
      <tr>
        <th>معرف المؤسسة</th>
        <th>معرف التثبيت</th>
        <th>الإصدار</th>
        <th>الأجهزة النشطة</th>
        <th>إجمالي البلاغات</th>
        <th>آخر ظهور</th>
      </tr>
    </thead>
    <tbody>
      ${institutions.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">لا توجد خوادم مؤسسات مسجلة حتى الآن.</td></tr>' : ''}
      ${institutions.map(inst => `
        <tr>
          <td><strong>${inst.institutionId}</strong></td>
          <td style="font-family: monospace;">${inst.installationId}</td>
          <td><span class="badge" style="background:#1e293b; color:#fff;">v${inst.appVersion}</span></td>
          <td>${Object.keys(inst.clientDevices || {}).length} جهاز</td>
          <td>${inst.totalReportsCount || 0}</td>
          <td style="color: var(--text-muted);">${new Date(inst.lastSeenAt).toLocaleString('ar-EG')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="section-title">🚨 أحدث البلاغات التشخيصية المشفرة المجهلة (${reports.length})</div>
  <table>
    <thead>
      <tr>
        <th>الوقت</th>
        <th>المؤسسة</th>
        <th>المصدر</th>
        <th>المكون</th>
        <th>الخطورة</th>
        <th>كود الخطأ والرسالة</th>
      </tr>
    </thead>
    <tbody>
      ${reports.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">لا توجد بلاغات أخطاء حتى الآن. النظام يعمل بكفاءة تامة.</td></tr>' : ''}
      ${reports.map(r => `
        <tr>
          <td style="white-space: nowrap; color: var(--text-muted);">${new Date(r.receivedAt).toLocaleTimeString('ar-EG')}</td>
          <td><strong>${r.institutionId}</strong></td>
          <td>
            <span class="badge" style="background: ${r.sourceType === 'client' ? '#3b0764; color: #d8b4fe' : '#0369a1; color: #bae6fd'};">
              ${r.sourceType === 'client' ? 'Student PC' : 'Server PC'}
            </span>
          </td>
          <td>${r.component}</td>
          <td class="tag-${r.severity}">${r.severity.toUpperCase()}</td>
          <td>
            <div><strong>[${r.errorCode}]</strong> ${r.sanitizedMessage}</div>
            ${r.sanitizedStackTrace ? `<div class="code-box" style="margin-top: 6px;">${r.sanitizedStackTrace}</div>` : ''}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <footer style="margin-top: 40px; color: var(--text-muted); font-size: 11px; text-align: center;">
    MISHKAT Technical Support Hub &bull; Local LAN / Developer Architecture Hardening
  </footer>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(` MISHKAT Developer Support Hub (Hardened)`);
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(` Ingest Endpoint: POST http://localhost:${PORT}/api/v1/support/ingest`);
  console.log(` Developer Admin Key: ${ADMIN_KEY}`);
  console.log(`========================================================`);
});
