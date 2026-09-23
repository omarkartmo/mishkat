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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
    screenshot TEXT,
    client_timestamp TEXT,
    received_at TEXT NOT NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(institution_id)
  );

  CREATE INDEX IF NOT EXISTS idx_reports_institution ON support_reports(institution_id);
  CREATE INDEX IF NOT EXISTS idx_reports_severity ON support_reports(severity);
  CREATE INDEX IF NOT EXISTS idx_reports_received_at ON support_reports(received_at);
`);

// Safe column migration if table existed before
try {
  db.exec('ALTER TABLE support_reports ADD COLUMN screenshot TEXT;');
} catch (e) {}

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
    console.warn(`[Support Receiver] ⚠️ Unauthorized support key for institution ${cleanInstId}`);
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
  let screenshot = null;
  if (report.screenshot && typeof report.screenshot === 'string' && (report.screenshot.startsWith('data:image/') || report.screenshot.startsWith('http'))) {
    screenshot = report.screenshot;
  } else if (typeof report.diagnosticContext === 'object' && report.diagnosticContext?.screenshot) {
    screenshot = report.diagnosticContext.screenshot;
  } else if (typeof report.diagnosticContext === 'string') {
    try {
      const parsed = JSON.parse(report.diagnosticContext);
      if (parsed.screenshot) screenshot = parsed.screenshot;
    } catch {}
  }

  const diagContext = typeof report.diagnosticContext === 'object'
    ? JSON.stringify(report.diagnosticContext)
    : (report.diagnosticContext || '{}');

  db.prepare(`
    INSERT INTO support_reports (
      report_id, institution_id, installation_id, app_version,
      source_type, client_device_id, user_role, component,
      error_type, error_code, severity, sanitized_message,
      sanitized_stack_trace, diagnostic_context, screenshot, client_timestamp, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    screenshot,
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

app.post('/api/v1/support/purge-test-data', (req, res) => {
  try {
    db.exec(`
      DELETE FROM support_reports;
      DELETE FROM institutions;
    `);
    return res.json({ success: true, message: 'All test reports and institutions purged cleanly' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Developer Support Dashboard UI
app.get(['/', '/dashboard'], (req, res) => {
  const institutions = db.prepare('SELECT institution_id, installation_id, app_version, first_seen_at, last_seen_at, reports_count, status FROM institutions ORDER BY last_seen_at DESC').all();
  const reports = db.prepare('SELECT * FROM support_reports ORDER BY received_at DESC LIMIT 100').all();

  const totalReports = reports.length > 0 ? db.prepare('SELECT COUNT(*) as count FROM support_reports').get().count : 0;
  const criticalCount = db.prepare("SELECT COUNT(*) as count FROM support_reports WHERE severity = 'critical'").get().count;
  const warningCount = db.prepare("SELECT COUNT(*) as count FROM support_reports WHERE severity = 'warning'").get().count;
  const infoCount = db.prepare("SELECT COUNT(*) as count FROM support_reports WHERE severity = 'info'").get().count;

  const renderedInstitutions = institutions.length === 0
    ? '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">لا توجد مؤسسات مسجلة بعد. سيتم التسجيل تلقائياً فور أول إرسال.</td></tr>'
    : institutions.map(i => `
        <tr>
          <td><strong>${i.institution_id}</strong></td>
          <td style="font-family: monospace; font-size: 11px; color: var(--text-muted);">${i.installation_id}</td>
          <td><span class="badge" style="background: #1e293b; color: #cbd5e1;">v${i.app_version || '1.0.0'}</span></td>
          <td><strong>${i.reports_count}</strong></td>
          <td style="font-size: 11px; color: var(--text-muted);">${new Date(i.first_seen_at).toLocaleString('ar-EG')}</td>
          <td style="font-size: 11px; color: var(--text-muted);">${new Date(i.last_seen_at).toLocaleString('ar-EG')}</td>
          <td>
            <button class="btn btn-antigravity" onclick="copyInstitutionErrorsForAntigravity('${i.institution_id}')">
              📋 نسخ أخطاء المؤسسة لـ Antigravity
            </button>
          </td>
        </tr>
      `).join('');

  const renderedReports = reports.length === 0
    ? '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">لا توجد بلاغات أخطاء حتى الآن. النظام يعمل بكفاءة تامة.</td></tr>'
    : reports.map(r => {
        const hasScreenshot = Boolean(r.screenshot);
        const sourceBadge = (r.source_type === 'server' && r.user_role === 'admin')
          ? '<span class="badge badge-admin">Server (Admin)</span>'
          : (r.source_type === 'server')
          ? '<span class="badge badge-server">Server (System)</span>'
          : '<span class="badge badge-student">Student (' + (r.client_device_id || 'PC') + ')</span>';

        const reportJson = JSON.stringify({
          report_id: r.report_id,
          institution_id: r.institution_id,
          installation_id: r.installation_id,
          app_version: r.app_version,
          source_type: r.source_type,
          client_device_id: r.client_device_id,
          user_role: r.user_role,
          component: r.component,
          error_type: r.error_type,
          error_code: r.error_code,
          severity: r.severity,
          sanitized_message: r.sanitized_message,
          sanitized_stack_trace: r.sanitized_stack_trace,
          diagnostic_context: r.diagnostic_context,
          received_at: r.received_at,
          has_screenshot: hasScreenshot,
        }).replace(/"/g, '&quot;');

        let detailsHtml = '';
        if (r.sanitized_stack_trace || (r.diagnostic_context && r.diagnostic_context !== '{}')) {
          detailsHtml = '<details><summary>عرض التفاصيل والـ Stack</summary>' +
            (r.sanitized_stack_trace ? '<div class="code-box" style="margin-top: 6px;">' + r.sanitized_stack_trace + '</div>' : '') +
            (r.diagnostic_context && r.diagnostic_context !== '{}' ? '<div class="code-box" style="margin-top: 6px;">' + r.diagnostic_context + '</div>' : '') +
            '</details>';
        }

        const screenshotCell = hasScreenshot
          ? '<img src="' + r.screenshot + '" class="thumb-btn" alt="Thumbnail" onclick="openScreenshot(\'' + r.report_id + '\')" title="انقر للتكبير" /><div style="display: none;" id="screen_' + r.report_id + '">' + r.screenshot + '</div>'
          : '<span style="color: var(--text-muted); font-size: 11px;">لا يوجد</span>';

        return '<tr>' +
          '<td style="white-space: nowrap; color: var(--text-muted); font-size: 11px;">' + new Date(r.received_at).toLocaleTimeString('ar-EG') + '</td>' +
          '<td><strong>' + r.institution_id + '</strong></td>' +
          '<td>' + sourceBadge + '</td>' +
          '<td style="font-family: monospace; font-size: 11px;">' + r.component + '</td>' +
          '<td class="tag-' + r.severity + '">' + r.severity.toUpperCase() + '</td>' +
          '<td><div><strong>[' + r.error_code + ']</strong> ' + r.sanitized_message + '</div>' + detailsHtml + '</td>' +
          '<td style="text-align: center;">' + screenshotCell + '</td>' +
          '<td><button class="btn btn-antigravity" onclick="copyReportForAntigravity(this)" data-report="' + reportJson + '">📋 نسخ للإصلاح في Antigravity</button></td>' +
          '</tr>';
      }).join('');

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
      flex-wrap: wrap;
      gap: 12px;
    }
    h1 { font-size: 20px; font-weight: 700; color: #fff; }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: bold;
    }
    .badge-dev { background: #312e81; color: #a5b4fc; }
    .badge-admin { background: #064e3b; color: #6ee7b7; border: 1px solid #059669; }
    .badge-server { background: #075985; color: #7dd3fc; border: 1px solid #0284c7; }
    .badge-student { background: #581c87; color: #d8b4fe; border: 1px solid #9333ea; }
    
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
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      margin-top: 28px;
    }
    .section-title { font-size: 16px; font-weight: 600; }
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
      padding: 12px 14px;
      text-align: right;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    th { background: #161f33; font-weight: 600; color: #cbd5e1; font-size: 12px; }
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

    /* Action Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 11px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn-antigravity {
      background: #4338ca;
      color: #fff;
      border-color: #6366f1;
    }
    .btn-antigravity:hover {
      background: #4f46e5;
      box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
    }
    .btn-screenshot {
      background: #0f766e;
      color: #ccfbf1;
      border-color: #14b8a6;
    }
    .btn-screenshot:hover {
      background: #115e59;
    }
    .btn-purge {
      background: #7f1d1d;
      color: #fecaca;
      border-color: #ef4444;
      padding: 6px 14px;
    }
    .btn-purge:hover {
      background: #991b1b;
    }
    .btn-refresh {
      background: #1e293b;
      color: #cbd5e1;
      border-color: #334155;
    }
    .btn-refresh:hover {
      background: #334155;
    }
    .thumb-btn {
      width: 44px;
      height: 32px;
      border-radius: 6px;
      border: 1px solid #334155;
      object-fit: cover;
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .thumb-btn:hover {
      transform: scale(1.1);
      border-color: #14b8a6;
    }

    /* Modal Lightbox for Screenshot */
    .lightbox-modal {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(4px);
      justify-content: center;
      align-items: center;
      padding: 24px;
    }
    .lightbox-modal.active {
      display: flex;
    }
    .lightbox-content {
      max-width: 90vw;
      max-height: 90vh;
      background: #111726;
      border: 1px solid #334155;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
    }
    .lightbox-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      border-bottom: 1px solid #1e293b;
      background: #0b0f19;
      font-size: 12px;
      font-weight: 600;
    }
    .lightbox-body {
      padding: 12px;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #060911;
      max-height: calc(90vh - 60px);
      overflow: auto;
    }
    .lightbox-img {
      max-width: 100%;
      max-height: 75vh;
      object-fit: contain;
      border-radius: 6px;
    }

    /* Toast Notification */
    #toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: #fff;
      padding: 10px 20px;
      border-radius: 30px;
      font-weight: bold;
      font-size: 12px;
      box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
      display: none;
      z-index: 10000;
      animation: fadeInOut 2.5s forwards;
    }
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translate(-50%, 10px); }
      15% { opacity: 1; transform: translate(-50%, 0); }
      85% { opacity: 1; transform: translate(-50%, 0); }
      100% { opacity: 0; transform: translate(-50%, -10px); }
    }
  </style>
</head>
<body>
  <div id="toast">✓ تم النسخ بنجاح! جاهز للصق في Antigravity</div>

  <!-- Screenshot Lightbox Modal -->
  <div id="screenshotModal" class="lightbox-modal" onclick="closeScreenshot(event)">
    <div class="lightbox-content" onclick="event.stopPropagation()">
      <div class="lightbox-header">
        <span id="lightboxTitle">📷 لقطة الشاشة التشخيصية</span>
        <button class="btn btn-refresh" onclick="closeScreenshot()" style="padding: 2px 8px;">✕ إغلاق</button>
      </div>
      <div class="lightbox-body">
        <img id="lightboxImage" class="lightbox-img" src="" alt="Screenshot" />
      </div>
    </div>
  </div>

  <header>
    <div>
      <h1>MISHKAT Support Server &mdash; Master Receiver</h1>
      <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
        مستقبل الأخطاء والتشخيصات المركزي المباشر &bull; تخزين محلي حصري (SQLite on Developer PC)
      </p>
    </div>
    <div class="header-actions">
      <button class="btn btn-refresh" onclick="location.reload()">🔄 تحديث</button>
      <button class="btn btn-purge" onclick="purgeTestData()">🗑️ مسح سجلات الاختبار</button>
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
      <div class="stat-label">معلومات وبلاغات (Info)</div>
      <div class="stat-val" style="color: #38bdf8;">${infoCount}</div>
    </div>
  </div>

  <div class="section-header">
    <div class="section-title">🏢 سجل المؤسسات (Registered Institutions)</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>معرف المؤسسة (Institution ID)</th>
        <th>معرف التثبيت (Installation ID)</th>
        <th>إصدار MISHKAT</th>
        <th>عدد التقارير</th>
        <th>تاريخ أول اتصال</th>
        <th>آخر تقرير / اتصال</th>
        <th>الإجراءات لـ Antigravity</th>
      </tr>
    </thead>
    <tbody>
      ${renderedInstitutions}
    </tbody>
  </table>

  <div class="section-header">
    <div class="section-title">🚨 سجل التقارير والبلاغات التشخيصية (Error & Problem Reports)</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>الوقت</th>
        <th>المؤسسة</th>
        <th>المصدر والدور</th>
        <th>المكون</th>
        <th>الخطورة</th>
        <th>كود الخطأ والرسالة والتشخيص</th>
        <th>الصورة / لقطة الشاشة</th>
        <th>الإجراءات</th>
      </tr>
    </thead>
    <tbody>
      ${renderedReports}
    </tbody>
  </table>

  <footer style="margin-top: 40px; color: var(--text-muted); font-size: 11px; text-align: center;">
    MISHKAT Master Support Receiver &bull; Local SQLite Storage &bull; Developer Machine Only
  </footer>

  <script>
    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.style.display = 'block';
      setTimeout(() => {
        toast.style.display = 'none';
      }, 2500);
    }

    function openScreenshot(reportId) {
      const screenDiv = document.getElementById('screen_' + reportId);
      if (!screenDiv) return;
      document.getElementById('lightboxImage').src = screenDiv.innerText.trim();
      document.getElementById('lightboxTitle').innerText = '📷 لقطة شاشة البلاغ: ' + reportId;
      document.getElementById('screenshotModal').classList.add('active');
    }

    function closeScreenshot() {
      document.getElementById('screenshotModal').classList.remove('active');
      document.getElementById('lightboxImage').src = '';
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeScreenshot();
    });

    function copyReportForAntigravity(btn) {
      try {
        const raw = btn.getAttribute('data-report');
        const r = JSON.parse(raw);

        const B = String.fromCharCode(96);
        const B3 = B + B + B;

        let diagFormatted = '';
        if (r.diagnostic_context && r.diagnostic_context !== '{}') {
          try {
            diagFormatted = JSON.stringify(JSON.parse(r.diagnostic_context), null, 2);
          } catch {
            diagFormatted = r.diagnostic_context;
          }
        }

        const sourceDesc = r.source_type === 'server'
          ? (r.user_role === 'admin' ? 'خادم المؤسسة (حساب الإدارة المركزي - Server Admin)' : 'خادم المؤسسة (Server Central)')
          : 'محطة حاسوب طالب (Student Station PC)';

        let md = '### 🚨 تقرير خطأ MISHKAT للمطور (نسخة للإصلاح الفوري في Antigravity)\\n\\n';
        md += '- **المؤسسة**: ' + B + r.institution_id + B + ' (' + B + r.installation_id + B + ')\\n';
        md += '- **معرف البلاغ (Report ID)**: ' + B + r.report_id + B + '\\n';
        md += '- **المصدر (Source)**: ' + sourceDesc + '\\n';
        md += '- **الدور (Role)**: ' + B + (r.user_role || 'unknown') + B + '\\n';
        md += '- **معرف الجهاز (Device ID)**: ' + B + (r.client_device_id || 'SERVER-CENTRAL') + B + '\\n';
        md += '- **المكون / الشاشة (Component)**: ' + B + r.component + B + '\\n';
        md += '- **كود ونوع الخطأ**: ' + B + '[' + r.error_code + ']' + B + ' (' + r.error_type + ')\\n';
        md += '- **الخطورة (Severity)**: ' + B + r.severity.toUpperCase() + B + '\\n';
        md += '- **إصدار التطبيق**: ' + B + 'v' + (r.app_version || '1.0.0') + B + '\\n';
        md += '- **وقت الاستلام**: ' + new Date(r.received_at).toLocaleString('ar-EG') + '\\n';
        md += '- **رسالة الخطأ / وصف المشكلة**:\\n> ' + r.sanitized_message + '\\n\\n';

        if (r.sanitized_stack_trace) {
          md += '#### Stack Trace:\\n' + B3 + 'text\\n' + r.sanitized_stack_trace + '\\n' + B3 + '\\n\\n';
        }

        if (diagFormatted) {
          md += '#### Diagnostic Context:\\n' + B3 + 'json\\n' + diagFormatted + '\\n' + B3 + '\\n\\n';
        }

        if (r.has_screenshot) {
          md += '> 📷 **ملاحظة تشخيصية**: توجد لقطة شاشة مرفقة مع هذا البلاغ في لوحة تحكم المطور.\\n\\n';
        }

        md += '---\\n**المطلوب من Antigravity:**\\nقم بتحليل هذا الخطأ بدقة، وحدد الملفات المعنية، وطبّق الإصلاح الجذري خطوة بخطوة مع التأكد من عدم المساس بالميزات الأخرى التي تعمل بنجاح.';

        navigator.clipboard.writeText(md).then(() => {
          showToast('✓ تم النسخ بنجاح! جاهز للصق في Antigravity');
          const originalText = btn.innerText;
          btn.innerText = '✓ تم النسخ!';
          btn.style.background = '#059669';
          setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = '';
          }, 2500);
        });
      } catch (err) {
        alert('فشل نسخ التقرير: ' + err.message);
      }
    }

    async function copyInstitutionErrorsForAntigravity(institutionId) {
      try {
        const res = await fetch('/api/v1/support/reports?institutionId=' + encodeURIComponent(institutionId));
        const json = await res.json();
        if (!json.success || !json.data || json.data.length === 0) {
          showToast('لا توجد تقارير مسجلة لهذه المؤسسة');
          return;
        }

        let md = '### 🚨 مجمع أخطاء وبلاغات مؤسسة MISHKAT: ' + institutionId + '\\n\\n';
        md += 'إجمالي التقارير المستلمة: ' + json.data.length + '\\n\\n';

        json.data.forEach((r, idx) => {
          md += '#### ' + (idx + 1) + '. [' + r.severity.toUpperCase() + '] ' + r.error_code + ' (' + r.component + ')\\n';
          md += '- المصدر: ' + (r.source_type === 'server' ? 'Server (' + r.user_role + ')' : 'Student PC (' + r.client_device_id + ')') + '\\n';
          md += '- الرسالة: ' + r.sanitized_message + '\\n';
          if (r.sanitized_stack_trace) {
            md += '- الـ Stack Trace: ' + r.sanitized_stack_trace.slice(0, 300) + '...\\n';
          }
          md += '\\n';
        });

        md += '---\\n**المطلوب من Antigravity:** فحص ومعالجة هذه المشكلات بشكل متكامل وآمن.';

        navigator.clipboard.writeText(md).then(() => {
          showToast('✓ تم نسخ جميع أخطاء المؤسسة بنجاح لـ Antigravity!');
        });
      } catch (err) {
        alert('فشل جلب أخطاء المؤسسة: ' + err.message);
      }
    }

    async function purgeTestData() {
      if (!confirm('هل أنت متأكد من رغبتك في مسح كافة سجلات الاختبار السابقة لبدء مرحلة اختبار حقيقية نظيفة؟')) {
        return;
      }
      try {
        const res = await fetch('/api/v1/support/purge-test-data', { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          alert('تم مسح كافة سجلات الاختبار بنجاح!');
          location.reload();
        } else {
          alert('فشل المسح: ' + json.error);
        }
      } catch (err) {
        alert('تعذر الاتصال بالخادم: ' + err.message);
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
    console.log(` MISHKAT Master Support Receiver (Developer PC)`);
    console.log(` Listening on: http://localhost:${PORT}`);
    console.log(` Ingestion Endpoint: POST http://localhost:${PORT}/api/v1/support/reports`);
    console.log(` Local Storage: ${DB_FILE}`);
    console.log(`========================================================`);
  });
}

module.exports = { app, db };
