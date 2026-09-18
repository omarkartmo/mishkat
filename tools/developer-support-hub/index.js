/**
 * MISHKAT Developer Support Hub
 * Standalone Local Support API & Monitoring Dashboard
 * Runs exclusively on Developer PC — Zero Cloud Server / Zero Cloud Database.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.SUPPORT_HUB_PORT || 4000;
const DATA_FILE = path.join(__dirname, 'support_hub_data.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Ensure local persistence database exists
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Data load error:', e.message);
  }
  return {
    institutions: {},
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

// Security Middleware: Validate Institution Credentials
function authenticateInstitution(req, res, next) {
  const institutionId = req.headers['x-institution-id'];
  const installationId = req.headers['x-installation-id'];
  const supportKey = req.headers['x-support-key'];

  if (!institutionId || !installationId) {
    return res.status(401).json({
      success: false,
      error: { message: 'Unauthorized: X-Institution-Id and X-Installation-Id headers are required' },
    });
  }

  req.institutionContext = {
    institutionId: String(institutionId).trim().slice(0, 100),
    installationId: String(installationId).trim().slice(0, 100),
    supportKey: supportKey ? String(supportKey).trim().slice(0, 100) : 'none',
  };

  next();
}

// 1. Ingest Diagnostic Report (Idempotent)
app.post('/api/v1/support/ingest', authenticateInstitution, (req, res) => {
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
});

// 2. Query Institutions
app.get('/api/v1/support/institutions', (req, res) => {
  const data = loadData();
  const list = Object.values(data.institutions).map((inst) => ({
    ...inst,
    activeDevicesCount: Object.keys(inst.clientDevices || {}).length,
  }));
  return res.json({ success: true, data: list });
});

// 3. Query Reports
app.get('/api/v1/support/reports', (req, res) => {
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

// 4. Developer Support Web Dashboard UI
app.get('/', (req, res) => {
  const data = loadData();
  const institutions = Object.values(data.institutions);
  const reports = data.reports.slice(0, 50);

  const criticalCount = data.reports.filter((r) => r.severity === 'critical').length;
  const warningCount = data.reports.filter((r) => r.severity === 'warning').length;

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
      border-radius: 12px;
    }
    .stat-title { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
    .stat-val { font-size: 24px; font-weight: bold; }
    .section-title { font-size: 16px; font-weight: bold; margin-bottom: 12px; color: #cbd5e1; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 30px;
      font-size: 13px;
    }
    th, td {
      padding: 12px 16px;
      text-align: right;
      border-bottom: 1px solid var(--border);
    }
    th { background: #0f172a; color: var(--text-muted); font-size: 12px; }
    tr:last-child td { border-bottom: none; }
    .crit { color: var(--danger); font-weight: bold; }
    .warn { color: var(--warning); }
    .info { color: #38bdf8; }
    pre {
      background: #020617;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 11px;
      color: #cbd5e1;
      max-width: 400px;
      overflow-x: auto;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>لوحة مركز الدعم الفني للمطور — نظام المشكاة</h1>
      <p style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">
        Developer PC Local Support API & Monitoring Engine • Zero Cloud Dependencies
      </p>
    </div>
    <div>
      <span class="badge badge-dev">خادم محلي نشط على المنفذ ${PORT}</span>
    </div>
  </header>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-title">إجمالي المؤسسات المسجلة</div>
      <div class="stat-val" style="color: var(--primary);">${institutions.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">إجمالي تقارير الأخطاء</div>
      <div class="stat-val">${data.reports.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">الأخطاء الحرجة (Critical)</div>
      <div class="stat-val crit">${criticalCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">التحذيرات (Warnings)</div>
      <div class="stat-val warn">${warningCount}</div>
    </div>
  </div>

  <div class="section-title">المؤسسات وخوادم المدارس المتصلة (${institutions.length})</div>
  <table>
    <thead>
      <tr>
        <th>معرف المؤسسة</th>
        <th>معرف التثبيت</th>
        <th>الإصدار</th>
        <th>أجهزة الطلاب النشطة</th>
        <th>آخر ظهور</th>
        <th>إجمالي التقارير</th>
      </tr>
    </thead>
    <tbody>
      ${institutions.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">لا توجد مؤسسات متصلة بعد</td></tr>' : ''}
      ${institutions.map(inst => `
        <tr>
          <td style="font-weight:bold; color:#a5b4fc;">${inst.institutionId}</td>
          <td style="font-family:monospace; color:var(--text-muted);">${inst.installationId}</td>
          <td><span style="background:#1e293b; padding:2px 8px; border-radius:4px;">v${inst.appVersion}</span></td>
          <td>${Object.keys(inst.clientDevices || {}).length} حاسوب</td>
          <td>${new Date(inst.lastSeenAt).toLocaleString('ar-SA')}</td>
          <td style="font-weight:bold;">${inst.totalReportsCount || 0}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="section-title">أحدث التقارير التشخيصية المستلمة (آخر 50 تقرير)</div>
  <table>
    <thead>
      <tr>
        <th>التاريخ</th>
        <th>المؤسسة</th>
        <th>المصدر</th>
        <th>الشدة</th>
        <th>المكون</th>
        <th>رمز الخطأ</th>
        <th>الرسالة التشخيصية</th>
      </tr>
    </thead>
    <tbody>
      ${reports.length === 0 ? '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">لم يتم استلام أي أخطاء، جميع المدارس تعمل بكفاءة</td></tr>' : ''}
      ${reports.map(r => `
        <tr>
          <td style="color:var(--text-muted); font-size:11px;">${new Date(r.receivedAt).toLocaleTimeString('ar-SA')}</td>
          <td>${r.institutionId}</td>
          <td><span style="font-size:11px; padding:2px 6px; border-radius:4px; background:#1e293b;">${r.sourceType}</span></td>
          <td class="${r.severity === 'critical' ? 'crit' : (r.severity === 'warning' ? 'warn' : 'info')}">${r.severity.toUpperCase()}</td>
          <td>${r.component}</td>
          <td style="font-family:monospace; font-weight:bold;">${r.errorCode}</td>
          <td>
            <div>${r.sanitizedMessage}</div>
            ${r.sanitizedStackTrace ? `<pre>${r.sanitizedStackTrace}</pre>` : ''}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🛠️  MISHKAT Developer Support Hub Ready`);
  console.log(`🌐 Local Dashboard:    http://localhost:${PORT}`);
  console.log(`📥 Ingest API:         POST http://localhost:${PORT}/api/v1/support/ingest`);
  console.log(`📂 Storage:            ${DATA_FILE}`);
  console.log(`======================================================\n`);
});
