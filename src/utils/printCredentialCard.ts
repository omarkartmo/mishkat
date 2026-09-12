/**
 * Utility to render and trigger printing of student credential cards.
 * Uses an isolated hidden iframe to prevent styling or fixed-position clipping issues with the main application window.
 */

export interface StudentCredentialCardData {
  name: string;
  registrationNumber: string;
  password: string;
  grade?: string;
}

export function printStudentCredentialCard(data: StudentCredentialCardData): void {
  const { name, registrationNumber, password, grade } = data;

  const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>بطاقة بيانات دخول الطالب - ${name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
    
    @page {
      size: A4 landscape;
      margin: 15mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Tajawal', sans-serif;
      background: #ffffff;
      color: #0f172a;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .card {
      width: 100%;
      max-width: 720px;
      border: 2.5px solid #0f172a;
      border-radius: 20px;
      padding: 32px 36px;
      background: #ffffff;
      position: relative;
      box-shadow: none;
      box-sizing: border-box;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-title {
      font-size: 22px;
      font-weight: 800;
      color: #1e293b;
    }

    .brand-sub {
      font-size: 13px;
      color: #64748b;
    }

    .badge {
      background: #f1f5f9;
      border: 1.5px solid #cbd5e1;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 700;
      color: #334155;
    }

    .field-group {
      margin-bottom: 16px;
    }

    .field-label {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 4px;
    }

    .field-value {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
    }

    .creds-box {
      background: #f8fafc;
      border: 2px dashed #94a3b8;
      border-radius: 14px;
      padding: 16px 22px;
      margin: 18px 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .cred-item {
      display: flex;
      flex-direction: column;
    }

    .cred-label {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 4px;
    }

    .cred-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 20px;
      font-weight: 700;
      color: #047857;
      letter-spacing: 0.5px;
    }

    .password-val {
      color: #b45309;
    }

    .footer {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid #f1f5f9;
      font-size: 11px;
      color: #64748b;
      line-height: 1.5;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="brand">
        <div>
          <div class="brand-title">مكتبة مشكاة المدرسية</div>
          <div class="brand-sub">نظام إدارة المعرفة والمطالعة الرقمية المركزية</div>
        </div>
      </div>
      <div class="badge">بطاقة دخول الطالب</div>
    </div>

    <div class="field-group">
      <div class="field-label">اسم الطالب الكامل</div>
      <div class="field-value">${escapeHtml(name)}</div>
    </div>

    ${grade ? `
    <div class="field-group" style="margin-top: -6px;">
      <div class="field-label">المستوى / القسم</div>
      <div class="field-value" style="font-size: 13px; font-weight: 500;">${escapeHtml(grade)}</div>
    </div>
    ` : ''}

    <div class="creds-box">
      <div class="cred-item">
        <span class="cred-label">رقم القيد (اسم المستخدم)</span>
        <span class="cred-val">${escapeHtml(registrationNumber)}</span>
      </div>
      <div class="cred-item">
        <span class="cred-label">كلمة المرور المؤقتة</span>
        <span class="cred-val password-val">${escapeHtml(password)}</span>
      </div>
    </div>

    <div class="footer">
      تنبيه أمني: هذه البيانات خاصة وسرية بالطالب للدخول إلى شبكة المكتبة المدرسية. يُرجى الحفاظ على سرية كلمة المرور.
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>
  `;

  // Create an invisible iframe for isolated printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Clean up iframe after print dialog completes
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 60000);
  }
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Utility to print bulk student credential cards onto standard A4 Portrait sheets.
 * Each A4 Portrait page contains EXACTLY 6 student cards (2 columns x 3 rows).
 * Includes clean dashed cut lines and styling optimized for school badge cards.
 */
export function printBulkStudentCredentialCards(students: StudentCredentialCardData[]): void {
  if (!students || students.length === 0) return;

  // Split students into pages of 6 cards each
  const pageSize = 6;
  const pages: StudentCredentialCardData[][] = [];
  for (let i = 0; i < students.length; i += pageSize) {
    pages.push(students.slice(i, i + pageSize));
  }

  const pagesHtml = pages.map((pageStudents) => `
    <div class="a4-page">
      ${pageStudents.map(student => `
        <div class="card-item">
          <div class="card-header">
            <div class="brand">
              <span class="brand-title">مكتبة مشكاة المدرسية</span>
              <span class="brand-sub">نظام المعرفة والمطالعة المركزية</span>
            </div>
            <span class="badge">بطاقة دخول</span>
          </div>

          <div class="card-body">
            <div class="student-name">${escapeHtml(student.name)}</div>
            ${student.grade ? `<div class="student-grade">${escapeHtml(student.grade)}</div>` : ''}

            <div class="creds-box">
              <div class="cred-col">
                <span class="cred-lbl">رقم القيد (اسم المستخدم)</span>
                <span class="cred-val">${escapeHtml(student.registrationNumber)}</span>
              </div>
              <div class="cred-col">
                <span class="cred-lbl">كلمة المرور المؤقتة</span>
                <span class="cred-val pass-val">${escapeHtml(student.password)}</span>
              </div>
            </div>
          </div>

          <div class="card-footer">
            <span>✂️ قص على طول الخط المنقط • سرية وخاصة بالطالب فقط</span>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>طباعة بطاقات بيانات دخول الطلبة (A4 - 6 بطاقات في الصفحة)</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=JetBrains+Mono:wght@600;700&display=swap');

    @page {
      size: A4 portrait;
      margin: 8mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Tajawal', sans-serif;
      background: #ffffff;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .a4-page {
      width: 194mm;
      height: 281mm;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr 1fr;
      gap: 4.5mm;
      page-break-after: always;
      break-after: page;
      box-sizing: border-box;
      padding: 1mm;
    }

    .a4-page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }

    .card-item {
      border: 1.5px dashed #475569;
      border-radius: 12px;
      padding: 11px 14px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 6px;
    }

    .brand-title {
      font-size: 13px;
      font-weight: 800;
      color: #1e293b;
      display: block;
    }

    .brand-sub {
      font-size: 9px;
      color: #64748b;
      display: block;
    }

    .badge {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 2px 7px;
      border-radius: 9999px;
      font-size: 9.5px;
      font-weight: 700;
      color: #334155;
      white-space: nowrap;
    }

    .card-body {
      margin: 6px 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .student-name {
      font-size: 13.5px;
      font-weight: 800;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .student-grade {
      font-size: 10.5px;
      font-weight: 500;
      color: #475569;
      margin-top: -2px;
    }

    .creds-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 6px 10px;
      margin-top: 5px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .cred-col {
      display: flex;
      flex-direction: column;
    }

    .cred-lbl {
      font-size: 9px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 2px;
    }

    .cred-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #047857;
    }

    .pass-val {
      color: #b45309;
    }

    .card-footer {
      border-top: 1px solid #f1f5f9;
      padding-top: 4px;
      font-size: 8.5px;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  ${pagesHtml}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 60000);
  }
}
