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
      size: A6 landscape;
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
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 10px;
    }

    .card {
      width: 100%;
      max-width: 480px;
      border: 2px solid #0f172a;
      border-radius: 16px;
      padding: 24px;
      background: #ffffff;
      position: relative;
      box-shadow: none;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-title {
      font-size: 18px;
      font-weight: 800;
      color: #1e293b;
    }

    .brand-sub {
      font-size: 11px;
      color: #64748b;
    }

    .badge {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      color: #334155;
    }

    .field-group {
      margin-bottom: 14px;
    }

    .field-label {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 4px;
    }

    .field-value {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
    }

    .creds-box {
      background: #f8fafc;
      border: 1.5px dashed #94a3b8;
      border-radius: 12px;
      padding: 12px 16px;
      margin: 14px 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .cred-item {
      display: flex;
      flex-direction: column;
    }

    .cred-label {
      font-size: 10px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 2px;
    }

    .cred-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 700;
      color: #047857;
      letter-spacing: 0.5px;
    }

    .password-val {
      color: #b45309;
    }

    .footer {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #f1f5f9;
      font-size: 9.5px;
      color: #64748b;
      line-height: 1.4;
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
