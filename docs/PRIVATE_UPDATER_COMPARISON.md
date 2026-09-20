# Architecture Decision Analysis: Private GitHub Releases Access

هذا التقرير يحلل الخيارات المعمارية المتاحة لتمكين MISHKAT Server من الوصول إلى تحديثات GitHub في وضع الـ (Private)، دون كشف أي بيانات اعتماد (Secrets) لأجهزة المؤسسات.

---

## A. Current Architecture (البنية الحالية)

في الوضع الحالي (مستودع عام)، يعمل الـ Updater كالتالي:
1. **Source & Identity:** يعتمد `updaterService.ts` على قراءة `MISHKAT_GITHUB_REPO` (الافتراضي `omarkartmo/mishkat`).
2. **Metadata Fetching:** يرسل طلب `GET` مجهول الهوية (Unauthenticated) إلى `https://api.github.com/repos/.../releases/latest`.
3. **Asset Discovery:** يحلل الـ JSON للبحث عن `release-manifest.json` و `mishkat-server-vX.Y.Z.zip` من مصفوفة الـ `assets` ويستخرج `browser_download_url`.
4. **Download:** يقوم بعمل `fetch()` مباشر للـ URL.
5. **No Authentication:** لا يوجد أي `Authorization` Header، ولا تُقرأ أي Tokens من `.env`.
6. **No Client Configuration:** العميل لا يحتاج إلى أي إعدادات خاصة بالتحديث سوى الوصول للإنترنت.

---

## B. Option A — PAT (Personal Access Token على العميل)

- **Architecture:** زرع PAT ثابت أو يُقرأ من `.env` داخل MISHKAT Server، يُرسل مع كل طلب لـ GitHub API كالتالي: `Authorization: Bearer <PAT>`.
- **Security:** **ضعيف جداً/كارثي.** أي مسؤول نظام في المؤسسة يمكنه استخراج الـ PAT من الـ RAM، أو فك تشفير الكود (`server.cjs`)، أو قراءة الـ `.env`. بمجرد تسريبه، يملك المخترق صلاحيات قراءة الكود المصدري (Source Code) لـ MISHKAT وربما تغييره حسب صلاحيات الـ PAT.
- **Infrastructure:** `0` (لا يتطلب أي خدمات جديدة).
- **Complexity:** منخفض جداً في البرمجة.
- **Problems:** يفشل تماماً في شرط (No client-side GitHub secrets). مستبعد أمنياً.

---

## C. Option B — GitHub App (وصول عبر تطبيق مركزي)

**إجابة السؤال الدقيق:** هل يمكن أن تكون הـ App والـ Private Key بالكامل على خدمة مركزية دون أن يمتلك MISHKAT Server أي GitHub credential؟
**الجواب: نعم، ولكن هذا يجعله مجرد "طريقة مصادقة" داخل خدمة (API)، وليس خياراً مستقلاً.** 
إذا وضعنا הـ Private Key في خدمة مركزية، فإن هذه الخدمة ستقوم بتوليد "Installation Token". إذا أرسلت هذه الخدمة الـ Token إلى MISHKAT Server، فإن MISHKAT سيتمكن من تحميل الـ Release، ولكنه **أيضاً سيمتلك صلاحية استنساخ الكود المصدري (git clone)** طوال فترة صلاحية الـ Token (حتى لو كانت ساعة واحدة).
لذلك، **يجب** ألا يصل الـ Token للعميل أبداً. الحل الوحيد هو أن تقوم الخدمة المركزية بالوساطة (Proxy) في تحميل الملف. وهنا يذوب الخيار B ليصبح مجرد تفصيل تنفيذي لـ Option C.

- **Architecture:** MISHKAT يكلم خدمة مركزية -> الخدمة تولد Token بالـ Private Key -> الخدمة تكلم GitHub للتحميل -> الخدمة تمرر الملف לـ MISHKAT.
- **Security:** آمن جداً. لا توجد Secrets في المؤسسات.
- **Infrastructure:** يتطلب خادم/خدمة (Serverless API).
- **Complexity:** متوسط. يتطلب إدارة GitHub App، وتشفير Private Keys في الـ CI/CD، وإدارة Tokens.
- **Problems:** الـ GitHub App هي طريقة Authentication وليست Infrastructure. يتطلب API.

---

## D. Option C — Update Control API (الخدمة الوسيطة)

- **Architecture:** إنشاء API صغير (مثل Cloudflare Worker). يقوم `updaterService.ts` بطلب `https://api.mishkat.com/latest`. يقوم الـ API باستخدام PAT (مخزن آمن Server-side) بطلب GitHub API، وإرجاع الـ Metadata. وللتحميل، يطلب العميل `https://api.mishkat.com/download/asset_id` فيقوم الـ Worker بعمل Proxy للـ ZIP من GitHub إلى العميل.
- **Security:** آمن تماماً. الـ Secret مخفي في الـ Backend ولا يصل للعميل.
- **Infrastructure:** يتطلب خدمة Serverless واحدة (ولا تتطلب Database ولا حسابات مؤسسات حالياً، يمكن أن تكون خدمة عامة لكنها تُخفي الـ PAT فقط).
- **Complexity:** متوسط.
- **Problems:** 
  - הـ API يصبح نقطة فشل (Single Point of Failure).
  - إذا حدث تحديث لـ 50 مؤسسة في وقت واحد، سيقوم הـ API باستهلاك الـ GitHub Rate Limit (5000 طلب/ساعة للـ PAT).
  - تمرير ملف بحجم 100MB عبر Worker قد يصطدم بقيود الـ Bandwidth/Timeout للخدمات المجانية.

---

## E. Option D — Static Object Storage (تخزين الكائنات الثابتة)

- **Architecture:** عند بناء Release جديد، يقوم `GitHub Actions` (باستخدام صلاحياته الداخلية) بنسخ `mishkat-server.zip` و `release-manifest.json` إلى مساحة تخزين ثابتة (Cloudflare R2 / AWS S3).
- يتصل `updaterService.ts` مباشرة بـ `https://updates.mishkat.com/release-manifest.json`.
- **Security:** آمن تماماً. مساحة الـ Storage لا تحتوي على الكود المصدري، بل على الملفات المجمعة (`dist` ZIP). لا يحتاج العميل لأي Tokens، فقط URL.
- **Infrastructure:** يتطلب S3 Bucket / Cloudflare R2 (لا يحتاج لخوادم أو APIs أو Databases).
- **Complexity:** منخفض جداً في التطبيق، يتطلب فقط سكريبت الرفع في `GitHub Actions`.
- **Problems:** يخلق مسار توزيع منفصل (Distribution Pipeline) بجانب GitHub Releases. الـ S3 يصبح هو المصدر الفعلي للتحميل بدلاً من GitHub (الذي سيصبح مصدر الكود فقط).

---

## Comparison Matrix

| المعيار | A (PAT) | B (GitHub App) | C (Update API) | D (Object Storage) |
| :--- | :--- | :--- | :--- | :--- |
| **Security** | Low (Leaked) | High | High | High |
| **No client-side GitHub secrets** | No (Fails) | Yes (If proxied) | Yes | Yes |
| **Infrastructure required** | None | 1 Serverless Service | 1 Serverless Service | 1 Object Storage Bucket |
| **Number of new services** | 0 | 1 | 1 | 1 |
| **Operational complexity** | Low | High (App management) | Medium (API Proxying) | Low (Static files) |
| **Cost** | $0 | Low | Low (but bandwidth risky) | Extremely Low (R2 is $0 egress) |
| **Maintenance** | Low | Medium | Medium (API updates) | Very Low (No code to maintain) |
| **Scalability to many institutions** | Fails (Rate limit) | Medium (API bottlenecks) | Medium (GitHub Rate limits) | Infinite (CDN built-in) |
| **GitHub Private compatibility** | Yes | Yes | Yes | Yes |
| **Compatibility with current updaterService** | Yes | Changes Target URL | Changes Target URL | Changes Target URL & Parsing |
| **Compatibility with current manifest** | Yes | Yes | Yes | Yes |
| **Compatibility with SHA-256** | Yes | Yes | Yes | Yes |
| **Compatibility with current backup/staging/rollback**| Yes | Yes | Yes | Yes |
| **Compatibility with Detached Updater** | Yes | Yes | Yes | Yes |
| **Failure modes** | Token revoked/Rate limit | App Auth fails/API down | API down/Rate limit hit | Bucket down (rare) |
| **Deployment complexity** | N/A | Hard | Medium | Easy (Automated via Actions) |
| **Ease of troubleshooting** | Easy | Hard | Medium | Very Easy (Direct URL check) |
| **Time to implement** | Minutes | Days | Days | Hours |
| **Long-term maintenance burden**| High (Security) | Medium | Medium | Low |

---

## Architectures (ASCII Diagrams)

### Option A (PAT)
```text
[MISHKAT Server] --(GET with Hardcoded PAT)--> [Private GitHub API]
```

### Option B / C (Update Control API with App or PAT)
```text
[MISHKAT Server]
       | (Anonymous or License Key GET)
       v
[Update Control API] (Cloudflare Worker/Vercel)
       | (Uses hidden Server-Side Secret)
       v
[Private GitHub API / Releases]
```

### Option D (Static Object Storage)
```text
[Private GitHub Repo] --(GitHub Action Push)--> [S3 / Cloudflare R2 Bucket]
                                                         |
[MISHKAT Server] <--(Anonymous GET manifest.json)--------+
```

---

## Minimal Infrastructure Delta

**Option A:**
- Delta: `0` Infrastructure. `+1` Hardcoded Secret.

**Option B & C:**
- Delta: `+1` Serverless API Endpoint. `+1` Domain/Route. `+1` Managed Secret (PAT or Private Key).

**Option D:**
- Delta: `+1` Cloud Storage Bucket. `+1` GitHub Action Step (`aws s3 cp` / `wrangler`).

---

## Impact on Existing Updater

بشكل عام، **الجزء السفلي بالكامل سيبقى سليماً ولن يتغير (0% Impact):**
`backup`, `staging`, `detached updater`, `migrations`, `health check`, `rollback`, `Admin UI`.

**التأثير سيكون محصوراً في مرحلة (Discovery & Download) فقط:**

- **Option A/B/C:**
  يتم تغيير `targetUrl` للـ API الجديد. طريقة القراءة (JSON parsing) تبقى متوافقة بشكل شبه كامل مع هيكل GitHub الحالي إذا قام الـ API بمحاكاته.
- **Option D:**
  يتغير `targetUrl` إلى رابط הـ Storage (مثلاً `https://updates.mishkat.app/manifest.json`).
  يُعدّل المنطق قليلاً ليقرأ الـ `manifest.json` مباشرة، ويأخذ رابط التحميل من داخله (لأنه لم يعد يستقبل رد GitHub API المعقد الذي يحتوي على مصفوفة `assets`).
  
---

## Operational Reality (كيف سيبدو الواقع مع 50-100 مؤسسة)

- **في Option C (API):**
  مرور 100 مؤسسة تتفحص التحديثات كل ساعة يستهلك آلاف الطلبات من GitHub API. عند إطلاق التحديث، ستقوم 100 مدرسة بتحميل ملف بحجم 100MB عبر הـ Worker الخاص بك (10GB Traffic في نفس اللحظة). هذا قد يسبب اختناقات (Timeouts) لأن الخدمات الوسيطة غير مصممة لنقل ملفات ضخمة بالتزامن في الباقات المجانية/الأساسية. سيتحول العبء إلى مراقبة الـ API.

- **في Option D (Storage):**
  الـ S3/CDN مصمم خصيصاً لتوزيع الملفات الثابتة. مليون مدرسة لن تؤثر على الأداء. التحديث مجرد رفع ملف واحد للـ Bucket. العبء التشغيلي يساوي تقريباً "صفر" بعد إعداده للمرة الأولى. لكنه يفرض أن S3 أصبح هو منصة الإطلاق الفعلية (Distribution Center).

---

## Implementation Estimate (التقديرات)

- **Option C (Update Control API):**
  **Medium.** يتطلب كتابة كود لـ API جديد، نشر الـ API، تأمينه، تعديل `updaterService` للتعامل معه، وحل مشاكل الـ Proxying للملفات الكبيرة.
- **Option D (Static Object Storage):**
  **Small.** يتطلب إنشاء Bucket، إضافة سكريبت في `.github/workflows/ci.yml` (عبر GitHub Action جاهز)، وتعديل 10 أسطر في `updaterService.ts` لطلب الـ Manifest المباشر.
