/**
 * MISHKAT Developer Support Server — Master Receiver
 * Standalone Local Support API & Monitoring Dashboard
 * Runs exclusively on Developer PC — Zero Cloud Server / Zero Cloud Database.
 * Local storage engine: Native Node.js SQLite (node:sqlite)
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.SUPPORT_SERVER_PORT || process.env.PORT || 4000;
const DB_FILE = path.join(__dirname, 'support_storage.db');
const ADMIN_KEY = process.env.SUPPORT_ADMIN_KEY || 'mishkat_dev_admin_2026';

// Global middleware
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// Initialize SQLite database
const db = new DatabaseSync(DB_FILE);

// Set up tables and indices
db.exec(`
  CREATE TABLE IF NOT EXISTS institutions (
    institution_id TEXT PRIMARY KEY,
    installation_id TEXT NOT NULL,
    support_key_hash TEXT NOT NULL,
    app_version TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    reports_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS support_reports (
    report_id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    app_version TEXT NOT NULL,
    source_type TEXT NOT NULL,
    client_device_id TEXT,
    user_role TEXT,
    component TEXT NOT NULL,
    error_type TEXT NOT NULL,
    error_code TEXT NOT NULL,
    severity TEXT NOT NULL,
    sanitized_message TEXT NOT NULL,
    sanitized_stack_trace TEXT,
    diagnostic_context TEXT,
    client_timestamp TEXT,
    received_at TEXT NOT NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(institution_id)
  );

  CREATE INDEX IF NOT EXISTS idx_reports_institution ON support_reports(institution_id);
  CREATE INDEX IF NOT EXISTS idx_reports_severity ON support_reports(severity);
  CREATE INDEX IF NOT EXISTS idx_reports_received_at ON support_reports(received_at);
`);

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

// Authentication Middleware for Master Receiver
function authenticateInstitution(req, res, next) {
  const institutionId = req.headers['x-institution-id'];
  const installationId = req.headers['x-installation-id'];
  const supportKey = req.headers['x-support-key'];

  if (!institutionId || !installationId || !supportKey) {
    return res.status(401).json({
      acknowledged: false,
      error: { message: 'Unauthorized: X-Institution-Id, X-Installation-Id, and X-Support-Key headers are required' },
    });
  }

  const cleanInstId = String(institutionId).trim().slice(0, 100);
  const cleanInstallId = String(installationId).trim().slice(0, 100);
  const cleanKey = String(supportKey).trim().slice(0, 150);

  const selectInst = db.prepare('SELECT * FROM institutions WHERE institution_id = ?');
  const institution = selectInst.get(cleanInstId);

  if (!institution) {
    // Auto-enroll institution securely on first connection
    const keyHash = crypto.createHash('sha256').update(cleanKey).digest('hex');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO institutions (institution_id, installation_id, support_key_hash, app_version, first_seen_at, last_seen_at, reports_count, status)
      VALUES (?, ?, ?, ?, ?, ?, 0, 'active')
    `).run(cleanInstId, cleanInstallId, keyHash, req.body?.appVersion || '1.0.0', now, now);

    req.institutionContext = { institutionId: cleanInstId, installationId: cleanInstallId };
    return next();
  }

  // Verify status
  if (institution.status !== 'active') {
    return res.status(403).json({
      acknowledged: false,
      error: { message: `Forbidden: Institution credentials are ${institution.status}` },
    });
  }

  // Verify support key in constant time
  if (!verifyKey(cleanKey, institution.support_key_hash)) {
    return res.status(401).json({
      acknowledged: false,
      error: { message: 'Unauthorized: Invalid X-Support-Key' },
    });
  }

  req.institutionContext = { institutionId: cleanInstId, installationId: cleanInstallId };
  next();
}

// 1. Ingestion Endpoint (POST /api/v1/support/reports and alias POST /api/v1/support/ingest)
function handleReportIngest(req, res) {
  const report = req.body;
  if (!report || !report.reportId || !report.component) {
    return res.status(400).json({
      acknowledged: false,
      error: { message: 'Invalid report: reportId and component are required' },
    });
  }

  const reportId = String(report.reportId).trim();
  const { institutionId, installationId } = req.institutionContext;

  // 2. Idempotency Check: if reportId already exists in SQLite
  const existingReport = db.prepare('SELECT report_id FROM support_reports WHERE report_id = ?').get(reportId);
  if (existingReport) {
    return res.status(200).json({
      acknowledged: true,
      reportId,
      duplicate: true,
      message: 'Report already received and stored (Idempotent ACK)',
    });
  }

  // 3. Insert new report into SQLite local storage
  const now = new Date().toISOString();
  const diagContext = typeof report.diagnosticContext === 'object'
    ? JSON.stringify(report.diagnosticContext)
    : (report.diagnosticContext || '{}');

  db.prepare(`
    INSERT INTO support_reports (
      report_id, institution_id, installation_id, app_version,
      source_type, client_device_id, user_role, component,
      error_type, error_code, severity, sanitized_message,
      sanitized_stack_trace, diagnostic_context, client_timestamp, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reportId,
    institutionId,
    installationId,
    report.appVersion || '1.0.0',
    report.sourceType || 'server',
    report.clientDeviceId || null,
    report.userRole || 'system',
    report.component,
    report.errorType || 'ERROR',
    report.errorCode || 'ERR',
    ['critical', 'warning', 'info'].includes(report.severity) ? report.severity : 'warning',
    report.sanitizedMessage || report.message || 'No description provided',
    report.sanitizedStackTrace || report.stackTrace || null,
    diagContext,
    report.timestamp || now,
    now
  );

  // Update institution stats
  db.prepare(`
    UPDATE institutions
    SET last_seen_at = ?, app_version = ?, reports_count = reports_count + 1
    WHERE institution_id = ?
  `).run(now, report.appVersion || '1.0.0', institutionId);

  return res.status(200).json({
    acknowledged: true,
    reportId,
    duplicate: false,
    receivedAt: now,
  });
}

app.post('/api/v1/support/reports', authenticateInstitution, handleReportIngest);
app.post('/api/v1/support/ingest', authenticateInstitution, handleReportIngest);

// 4. Query Endpoints
app.get('/api/v1/support/institutions', (req, res) => {
  const institutions = db.prepare('SELECT institution_id, installation_id, app_version, first_seen_at, last_seen_at, reports_count, status FROM institutions ORDER BY last_seen_at DESC').all();
  return res.json({ success: true, data: institutions });
});

app.get('/api/v1/support/reports', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  let query = 'SELECT * FROM support_reports';
  const params = [];

  if (req.query.institutionId) {
    query += ' WHERE institution_id = ?';
    params.push(req.query.institutionId);
  }

  query += ' ORDER BY received_at DESC LIMIT ?';
  params.push(limit);

  const reports = db.prepare(query).all(...params);
  return res.json({ success: true, data: reports });
});

app.get('/api/v1/support/stats', (req, res) => {
  const totalReports = db.prepare('SELECT COUNT(*) as count FROM support_reports').get().count;
  const criticalCount = db.prepare("SELECT COUNT(*) as count FROM support_reports WHERE severity = 'critical'").get().count;
  const warningCount = db.prepare("SELECT COUNT(*) as count FROM support_reports WHERE severity = 'warning'").get().count;
  const infoCount = db.prepare("SELECT COUNT(*) as count FROM support_reports WHERE severity = 'info'").get().count;
  const totalInstitutions = db.prepare('SELECT COUNT(*) as count FROM institutions').get().count;

  return res.json({
    success: true,
    data: {
      totalInstitutions,
      totalReports,
      criticalCount,
      warningCount,
      infoCount,
    },
  });
});

// 5. Developer Support Dashboard UI
app.get(['/', '/dashboard'], (req, res) => {
  const institutions = db.prepare('SELECT institution_id, installation_id, app_version, first_seen_at, last_seen_at, reports_count, status FROM institutions ORDER BY last_seen_at DESC').all();
  const reports = db.prepare('SELECT * FROM support_reports ORDER BY received_at DESC LIMIT 50').all();

  const totalReports = reports.length > 0 ? db.prepare('SELECT COUNT(*) as count FROM support_reports').get().count : 0;
  const criticalCount = db.prepare("SELECT COUNT(*) as count FROM support_reports WHERE severity = 'critical'").get().count;
  const warningCount = db.prepare("SELECT COUNT(*) as count FROM support_reports WHERE severity = 'warning'").get().count;
  const infoCount = db.prepare("SELECT COUNT(*) as count FROM support_reports WHERE severity = 'info'").get().count;

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MISHKAT — Master Support Receiver (Developer Dashboard)</title>
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
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; margin-top: 24px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid var(--border);
      font-size: 13px;
    }
    th, td {
      padding: 12px 16px;
      text-align: right;
      border-bottom: 1px solid var(--border);
    }
    th { background: #161f33; font-weight: 600; color: #cbd5e1; }
    tr:hover { background: #182338; }
    .tag-critical { color: var(--danger); font-weight: bold; }
    .tag-warning { color: var(--warning); font-weight: bold; }
    .tag-info { color: #38bdf8; font-weight: bold; }
    .code-box {
      font-family: monospace;
      font-size: 11px;
      background: #060911;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      max-height: 120px;
      overflow-y: auto;
      white-space: pre-wrap;
      direction: ltr;
      text-align: left;
    }
    details summary {
      cursor: pointer;
      color: #818cf8;
      font-size: 11px;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>MISHKAT Support Server &mdash; Master Receiver</h1>
      <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
        مستقبل الأخطاء والتشخيصات المركزي المباشر &bull; تخزين محلي حصري (SQLite on Developer PC)
      </p>
    </div>
    <div>
      <span class="badge badge-dev">Master Receiver &bull; Port ${PORT}</span>
    </div>
  </header>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">المؤسسات المسجلة</div>
      <div class="stat-val" style="color: #a5b4fc;">${institutions.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">إجمالي التقارير</div>
      <div class="stat-val">${totalReports}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">أعطال حرجة (Critical)</div>
      <div class="stat-val" style="color: var(--danger);">${criticalCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">تحذيرات (Warning)</div>
      <div class="stat-val" style="color: var(--warning);">${warningCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">معلومات (Info)</div>
      <div class="stat-val" style="color: #38bdf8;">${infoCount}</div>
    </div>
  </div>

  <div class="section-title">🏢 سجل المؤسسات (Registered Institutions)</div>
  <table>
    <thead>
      <tr>
        <th>معرف المؤسسة (Institution ID)</th>
        <th>معرف التثبيت (Installation ID)</th>
        <th>إصدار MISHKAT</th>
        <th>عدد التقارير</th>
        <th>تاريخ أول اتصال</th>
        <th>آخر تقرير / اتصال</th>
      </tr>
    </thead>
    <tbody>
      ${institutions.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">لا توجد مؤسسات مسجلة بعد. سيتم التسجيل تلقائياً فور أول إرسال.</td></tr>' : ''}
      ${institutions.map(i => `
        <tr>
          <td><strong>${i.institution_id}</strong></td>
          <td style="font-family: monospace; font-size: 11px; color: var(--text-muted);">${i.installation_id}</td>
          <td><span class="badge" style="background: #1e293b; color: #cbd5e1;">v${i.app_version || '1.0.0'}</span></td>
          <td><strong>${i.reports_count}</strong></td>
          <td style="font-size: 11px; color: var(--text-muted);">${new Date(i.first_seen_at).toLocaleString('ar-EG')}</td>
          <td style="font-size: 11px; color: var(--text-muted);">${new Date(i.last_seen_at).toLocaleString('ar-EG')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="section-title">🚨 أحدث التقارير التشخيصية (Recent Reports)</div>
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
          <td style="white-space: nowrap; color: var(--text-muted); font-size: 11px;">${new Date(r.received_at).toLocaleTimeString('ar-EG')}</td>
          <td><strong>${r.institution_id}</strong></td>
          <td>
            <span class="badge" style="background: ${r.source_type === 'client' ? '#3b0764; color: #d8b4fe' : '#0369a1; color: #bae6fd'};">
              ${r.source_type === 'client' ? 'Student PC' : 'Server PC'}
            </span>
          </td>
          <td>${r.component}</td>
          <td class="tag-${r.severity}">${r.severity.toUpperCase()}</td>
          <td>
            <div><strong>[${r.error_code}]</strong> ${r.sanitized_message}</div>
            ${r.sanitized_stack_trace || (r.diagnostic_context && r.diagnostic_context !== '{}') ? `
              <details>
                <summary>عرض التفاصيل والتشخيص</summary>
                ${r.sanitized_stack_trace ? `<div class="code-box" style="margin-top: 6px;">${r.sanitized_stack_trace}</div>` : ''}
                ${r.diagnostic_context && r.diagnostic_context !== '{}' ? `<div class="code-box" style="margin-top: 6px;">${r.diagnostic_context}</div>` : ''}
              </details>
            ` : ''}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <footer style="margin-top: 40px; color: var(--text-muted); font-size: 11px; text-align: center;">
    MISHKAT Master Support Receiver &bull; Local SQLite Storage &bull; Developer Machine Only
  </footer>
</body>
</html>`);
});

// Start Server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================================`);
    console.log(` MISHKAT Master Support Receiver (Developer PC)`);
    console.log(` Listening on: http://localhost:${PORT}`);
    console.log(` Ingestion Endpoint: POST http://localhost:${PORT}/api/v1/support/reports`);
    console.log(` Local Storage: ${DB_FILE}`);
    console.log(`========================================================`);
  });
}

module.exports = { app, db };
