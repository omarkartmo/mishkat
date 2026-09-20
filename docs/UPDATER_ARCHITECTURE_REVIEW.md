# تقرير المراجعة المعمارية: تأمين تحديثات نظام المشكاة من مستودع خاص (Private Repository)

بناءً على طلبك، قمت بإجراء دراسة معمارية شاملة لآلية التحديث الحالية في `updaterService.ts` وتأثير تحويل مستودع GitHub إلى (Private). الهدف الأساسي هو ضمان أمان بيانات الاعتماد (Credentials) مع الحفاظ على كافة المكتسبات المعمارية السابقة للنظام.

---

## 1. البنية الحالية (Current Architecture)
يعتمد الـ Updater الحالي على طلبات غير موثقة (Unauthenticated Requests) للوصول إلى بيانات التحديث:
- **جلب البيانات:** يقوم `updaterService` بإرسال طلب `GET` مجاني ومجهول إلى `https://api.github.com/repos/omarkartmo/mishkat/releases/latest`.
- **التحميل:** يقرأ رابط الـ `browser_download_url` الخاص بالـ ZIP ويقوم بتحميله مباشرة.
- هذا السلوك يعتمد كلياً على كون المستودع (Public)، حيث تسمح GitHub بتحميل الـ Releases العامة بدون أي Authentication.

## 2. مشكلة المستودع الخاص (Private Repository Problem)
بمجرد تحويل المستودع إلى Private:
- سترد واجهة برمجة GitHub (API) بخطأ `404 Not Found` لأي طلب مجهول.
- للوصول إلى הـ Releases الخاصة، تفرض GitHub إرفاق `Authorization: Bearer <TOKEN>` (مثل Personal Access Token - PAT).
- **جوهر المشكلة الأمنية:** إذا قمنا بتضمين هذا الـ Token بداخل كود الخادم (`updaterService.ts`)، أو ملف `.env`، سيتم توزيعه لأجهزة العميل (المدارس/المؤسسات). أي مسؤول نظام هناك يمكنه بسهولة استخراج الـ Token من الملفات. بمجرد امتلاكه للـ Token، سيمتلك صلاحية الوصول الكاملة لقراءة (وربما تعديل) الـ Source Code الخاص بك على GitHub، مما يشكل ثغرة تسريب أمنية كارثية (Secret Extraction).

---

## 3. تحليل الخيارات المتاحة (Options)

### Option A — Direct GitHub Access (استخدام PAT داخل التطبيق)
- **الآلية:** زرع GitHub Token مخفي داخل الكود المصدري للـ Updater.
- **التقييم:** **مرفوض أمنياً كلياً.** لا يوجد ما يسمى "تشفير آمن للـ Token" على جهاز يمتلكه العميل. الهندسة العكسية لـ NodeJS ستكشف الـ Token حتماً.

### Option B — GitHub App
- **الآلية:** استخدام GitHub App لتوليد Tokens مؤقتة (Short-lived).
- **التقييم:** **غير صالح لبيئة On-Premise.** لكي يطلب التطبيق Token مؤقت، فإنه يحتاج إلى مفتاح التطبيق الخاص (Private Key). توزيع الـ Private Key للعملاء يعيدنا لنفس مشكلة تسريب الأسرار في Option A.

### Option C — Update Control API (Proxy Middleware)
- **الآلية:** إنشاء نقطة مركزية بسيطة (Serverless Function مثل Cloudflare Worker).
- الخادم الطرفي في المشكاة يطلب التحديث من `https://api.mishkat.com/latest`.
- الـ Worker (الذي يمتلك الـ GitHub PAT مشفراً في خوادمه بأمان) يقوم بالاستعلام من GitHub، ويرد بالبيانات، ويعمل كـ Proxy لتحميل الـ ZIP.
- **التقييم:** آمن جداً. يحل المشكلة دون تغيير دورة GitHub Releases، لكنه يستهلك موارد الـ API Proxy (نقل ملفات ZIP بحجم 100MB عبر Worker قد يواجه قيود Bandwidth أو CPU limits).

### Option D — Static Object Storage (أبسط حل ممكن)
- **الآلية:** يبقى مستودع GitHub خاصاً (Private). لكن عندما نقوم بعمل Release، يقوم `GitHub Actions Workflow` برفع ملفات التحديث (`mishkat-server.zip` و `release-manifest.json`) تلقائياً إلى مساحة تخزين سحابية عامة أو محمية بمفتاح بسيط (مثل **Cloudflare R2** أو **AWS S3**).
- خادم المشكاة يتصل بـ S3 مباشرة لتحميل الـ Manifest والـ ZIP.
- **التقييم:** ممتاز. لا حاجة لأي API، ولا يوجد قيود تحميل، وتكلفة شبه معدومة، ولا يوجد أي كود وسيط للصيانة.

---

## 4. البنية المعمارية الأقل تعقيداً والموصى بها (Recommended Minimal Architecture)

أوصي باعتماد **(Option D - Static Object Storage)** كالبنية الأبسط والأكثر استقراراً للأسباب التقنية التالية (أو **Option C** إذا كان إنشاء S3 bucket غير مسموح):

**لماذا Option D؟**
- **انعدام الخوادم (No Infrastructure):** أنت ترفع ملفات ZIP ثابتة (Static Assets). لا تحتاج إلى تشغيل خادم API لمعالجتها.
- **تجنب قيود GitHub (Rate Limits):** استخدام الـ PAT لقراءة الـ API محدود بطلبات معينة بالساعة. إذا قامت مئات المدارس بالبحث عن تحديثات دورية، قد يتم حظر الـ Token. الـ S3/R2 يتحمل ملايين الطلبات.
- **الأمان المطلق للـ Source Code:** الكود المصدري يبقى مسجوناً في GitHub Private. الملفات التي تخرج للـ S3 هي الـ Compiled Binaries (`dist`) فقط. لا يوجد أي Token في بيئة العميل.

*(ملاحظة: إذا كانت فلسفتك تعتمد بشكل صارم على إبقاء GitHub Release كمكان التخزين الوحيد في العالم للملفات، فإن Option C (Cloudflare Worker Proxy) هو البديل الوحيد الآمن، حيث يقوم الـ Worker بتخزين الـ GitHub Token مؤقتاً (Caching) لتقليل الـ Rate Limits).*

---

## 5. التعديلات الدقيقة المطلوبة (Exact changes required)

في حال اختيار **Option D** (أو C):
1. **في تطبيق المشكاة (`updaterService.ts`):** 
   - سيتغير فقط رابط الـ `feedUrl` الافتراضي ليكون رابط الـ Storage (مثل `https://updates.mishkat.com/release-manifest.json`).
   - إلغاء منطق فك تشفير استجابات `api.github.com/releases` المخصص، واستبداله بقراءة الـ `release-manifest.json` مباشرة.
2. **في بيئة التطوير (GitHub):**
   - إضافة سطرين في سكريبت الـ `release` لرفع الحزمة المنتجة (`mishkat-server.zip`) إلى الـ Storage.
3. **لا شيء آخر!** لن تتغير واجهة الـ Admin، ولن يتغير الـ Installer.

---

## 6. المخاطر الأمنية وطرق الحماية (Security Risks)

- **Token Leakage:** **لا يوجد خطر.** لن نقوم بتوزيع أي GitHub Token مع التطبيق.
- **Unauthorized Release Download (تحميل النسخة من قبل غير العملاء):** إذا كان الرابط (Public)، قد يتمكن أي شخص من تحميل التحديث. **الحل:** الـ Compiled Code الموجود في الـ ZIP خاضع أصلاً لـ Minification، ولا يشكل تسريبه خطراً أكبر من تسريب الـ Installer الأصلي. إذا أردت تقييده، يمكن وضع مفتاح بسيط `X-Update-Key` ثابت للتحميل (Obscurity).
- **Release Tampering (العبث بحزمة التحديث):** محمية كلياً. المكتسب السابق الخاص بفحص `SHA-256 Checksum` سيكتشف أي تلاعب بالـ ZIP قبل فك ضغطه.
- **Replay / Old Release Issues (إجبار العميل على تحديث قديم):** محمي. دالة `isNewerVersion()` ترفض تطبيق تحديث يمتلك إصداراً أقدم أو مساوياً للإصدار الحالي.

---

## 7. التوافقية والمحافظة على المكتسبات (Compatibility)

الحل المقترح يتواصل **فقط** مع نقطة دخول التحديث، ولن يمس البنية الأساسية.
✅ **Detached Updater:** سيبقى يعمل دون أي تغيير.
✅ **Rollback & Migrations:** لم يتم المساس بها وتعمل كما هي.
✅ **SHA-256:** يبقى خط الدفاع الأول للتأكد من موثوقية الـ ZIP المحمل من الـ Storage.
✅ **Admin UI & Tauri Student:** لم ولن يتم التعديل عليها، التجربة تبقى شفافة وسهلة.
✅ **Tailscale & Security Hardening:** التحديثات تتم عبر منفذ HTTPS `443` قياسي، ولا تتعارض مع قيود الشبكة المغلقة أو سياسات الـ Firewall.

---

## 8. التوصية النهائية للتنفيذ (Final Recommendation)

للمضي قدماً دون إثقال البنية التحتية وتعريض المستودع الخاص للخطر:
أوصي باستخدام **Cloudflare R2** (أو مساحة استضافة ويب Static) تعمل كنقطة (Update Feed) لتخزين حزم الـ ZIP والـ Manifest التي يُنتجها الـ Build السليم، وتعديل `updaterService.ts` لتوجيه طلب `fetch` إلى هذه النقطة الثابتة بدلاً من `api.github.com`.

أنا متوقف الآن تماماً. بانتظار قرارك المعماري (اختيار Option C أو D) أو إعطاء أي توجيه للمضي في التنفيذ.
