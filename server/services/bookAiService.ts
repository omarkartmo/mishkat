import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { PDFDocument } from 'pdf-lib';
import { db } from '../db/pool';

export interface AiExtractedBookMetadata {
  title: string;
  author: string;
  categoryId: string;
  categoryName: string;
  summary: string;
  language: 'ar' | 'fr' | 'en' | 'other';
  confidence: number;
  isScanned: boolean;
  modelUsed: string;
}

export interface LibraryCategoryInfo {
  id: string;
  name: string;
  description?: string;
}

const OFFICIAL_CATEGORIES: Record<string, string> = {
  'cat-islamic': 'العلوم الشرعية والفكر الإسلامي',
  'cat-arabic': 'اللغة العربية وآدابها',
  'cat-history': 'التاريخ والحضارة والآثار',
  'cat-science': 'العلوم الطبيعية والتكنولوجيا',
  'cat-education': 'التربية ومناهج البحث العلمي',
  'cat-general': 'الثقافة العامة والتطوير الذاتي',
};

/**
 * Retrieves the active categories from the database, falling back to default categories
 */
export async function getActiveCategories(): Promise<LibraryCategoryInfo[]> {
  try {
    const { rows } = await db.query(
      'SELECT id, name, description FROM categories ORDER BY sort_order ASC, name ASC'
    );
    if (rows && rows.length > 0) {
      return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description || '',
      }));
    }
  } catch (err) {
    console.warn('[BookAI] Failed to fetch dynamic categories from db, using fallback:', err);
  }

  return Object.entries(OFFICIAL_CATEGORIES).map(([id, name]) => ({
    id,
    name,
    description: '',
  }));
}

/**
 * Retrieves the Gemini API Key from environment or database system_settings
 */
export async function getGeminiApiKey(): Promise<string | null> {
  // 1. Environment variable
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }

  // 2. Database system_settings (library_config)
  try {
    const { rows } = await db.query(
      "SELECT value FROM system_settings WHERE key = 'library_config' LIMIT 1"
    );
    if (rows.length > 0) {
      const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      if (val?.geminiApiKey && typeof val.geminiApiKey === 'string' && val.geminiApiKey.trim()) {
        return val.geminiApiKey.trim();
      }
    }
  } catch {
    // Database query failed, ignore
  }

  return null;
}

/**
 * Checks whether AI OCR is enabled in system configuration
 */
export async function isAiOcrEnabled(): Promise<boolean> {
  try {
    const { rows } = await db.query(
      "SELECT value FROM system_settings WHERE key = 'library_config' LIMIT 1"
    );
    if (rows.length > 0) {
      const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      if (val?.enableAiOcr !== undefined) {
        return Boolean(val.enableAiOcr);
      }
    }
  } catch {}

  // Enabled by default if an API key exists
  const key = await getGeminiApiKey();
  return Boolean(key);
}

function extractCleanErrorMessage(err: any): string {
  let raw = err?.message || String(err);
  try {
    const parsed = typeof raw === 'string' && raw.trim().startsWith('{') ? JSON.parse(raw) : null;
    if (parsed?.error?.message) {
      raw = parsed.error.message;
    }
  } catch {}

  if (/API key not valid|API_KEY_INVALID/i.test(raw)) {
    return 'مفتاح Google Gemini API غير صالح أو غير مفعل. يرجى التأكد من نسخه بدقة من Google AI Studio.';
  }
  if (/quota|RESOURCE_EXHAUSTED/i.test(raw)) {
    return 'تم استنفاد الحصة المسموحة للمفتاح مؤقتاً (Quota Exceeded). يرجى المحاولة بعد قليل أو مراجعة الحساب في Google AI Studio.';
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|NetworkError/i.test(raw)) {
    return 'تعذر الاتصال بخوادم Google (يرجى التحقق من اتصال الإنترنت أو إعدادات الشبكة).';
  }
  if (/User location is not supported/i.test(raw)) {
    return 'خدمة Google Gemini غير مدعومة حالياً في منطقتك الجغرافية بدون وسيط VPN/Proxy.';
  }
  if (/is not found for API version|not supported for generateContent/i.test(raw)) {
    return 'النموذج المطلوب غير متاح لهذا المفتاح أو تم إيقافه من قِبل Google. يرجى التأكد من تفعيل أحدث النماذج في Google AI Studio.';
  }
  return raw;
}

export interface WorkingAiModel {
  modelName: string;
  apiVersion?: 'v1' | 'v1beta';
}

let cachedWorkingModel: WorkingAiModel | null = null;

/**
 * Dynamically queries Google ModelService.ListModels across v1 and v1beta
 * to find the exact models available and authorized for this specific API key.
 */
export async function discoverAvailableGeminiModels(apiKey: string): Promise<WorkingAiModel[]> {
  const versions: Array<'v1' | 'v1beta'> = ['v1', 'v1beta'];
  const candidates: WorkingAiModel[] = [];

  for (const version of versions) {
    try {
      const url = `https://generativelanguage.googleapis.com/${version}/models?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        const errorText = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(errorText); } catch {}
        const rawMsg = parsed?.error?.message || errorText;
        if (/API key not valid|API_KEY_INVALID/i.test(rawMsg)) {
          throw new Error('API_KEY_INVALID: ' + rawMsg);
        }
        continue;
      }

      const data = (await res.json()) as any;
      const models = data?.models || [];
      const supported = models
        .filter((m: any) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => m.name.replace(/^models\//, '')) as string[];

      // Sort models: flash first, newer versions first
      supported.sort((a, b) => {
        const aIsFlash = a.includes('flash') ? 1 : 0;
        const bIsFlash = b.includes('flash') ? 1 : 0;
        if (aIsFlash !== bIsFlash) return bIsFlash - aIsFlash;
        return b.localeCompare(a);
      });

      for (const model of supported) {
        if (!candidates.some((c) => c.modelName === model && c.apiVersion === version)) {
          candidates.push({ modelName: model, apiVersion: version });
        }
      }
    } catch (err: any) {
      if (/API_KEY_INVALID/i.test(err?.message || '')) {
        throw err;
      }
    }
  }

  // Fallback defaults if discovery returned nothing (e.g. offline or restricted endpoint)
  if (candidates.length === 0) {
    return [
      { modelName: 'gemini-2.5-flash', apiVersion: 'v1' },
      { modelName: 'gemini-2.5-flash', apiVersion: 'v1beta' },
      { modelName: 'gemini-2.0-flash', apiVersion: 'v1' },
      { modelName: 'gemini-2.0-flash', apiVersion: 'v1beta' },
      { modelName: 'gemini-1.5-flash', apiVersion: 'v1' },
    ];
  }

  return candidates;
}

/**
 * Tests Gemini connectivity and API Key validity
 */
export async function testGeminiConnection(
  customApiKey?: string
): Promise<{ success: boolean; message: string; model?: string; error?: string }> {
  const cleanedKey = customApiKey?.trim().replace(/^["']|["']$/g, '');
  const key = cleanedKey || (await getGeminiApiKey());
  if (!key) {
    return {
      success: false,
      message: 'لم يتم توفير مفتاح Google Gemini API. يرجى إدخال المفتاح أولاً.',
    };
  }

  let candidates: WorkingAiModel[] = [];
  try {
    candidates = await discoverAvailableGeminiModels(key);
  } catch (discoveryErr: any) {
    const cleanErr = extractCleanErrorMessage(discoveryErr);
    return {
      success: false,
      message: `فشل الاتصال بمفتاح الذكاء الاصطناعي: ${cleanErr}`,
      error: cleanErr,
    };
  }

  let lastError = '';

  for (const candidate of candidates) {
    try {
      const ai = new GoogleGenAI({
        apiKey: key,
        ...(candidate.apiVersion ? { apiVersion: candidate.apiVersion } : {}),
      });
      const response = await ai.models.generateContent({
        model: candidate.modelName,
        contents: [
          'أجب بكلمة واحدة فقط: جاهز'
        ],
      });

      if (response && response.text) {
        cachedWorkingModel = candidate;
        return {
          success: true,
          message: `تم التحقق بنجاح! الاتصال بمحرك الذكاء الاصطناعي Google Gemini (${candidate.modelName}) نشط ومستعد لفحص وتصنيف الكتب.`,
          model: candidate.modelName,
        };
      }
    } catch (err: any) {
      const rawError = err.message || String(err);
      lastError = extractCleanErrorMessage(err);
      const isAuthError = err.status === 403 || /API key not valid|API_KEY_INVALID/i.test(rawError);
      if (isAuthError) {
        // Authentication or key error, no need to try other models
        break;
      }
    }
  }

  return {
    success: false,
    message: `فشل الاتصال بمفتاح الذكاء الاصطناعي: ${lastError}`,
    error: lastError,
  };
}

/**
 * Extracts the first N pages from a PDF file as a compact buffer
 * Prevents uploading giant 200MB+ files by slicing only the title, cover & introduction pages (1-3)
 */
export async function slicePdfFirstPages(filePath: string, maxPages: number = 3): Promise<Buffer> {
  const fileBytes = fs.readFileSync(filePath);

  // If already small (< 3MB), return directly
  if (fileBytes.length < 3 * 1024 * 1024) {
    try {
      const srcDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
      if (srcDoc.getPageCount() <= maxPages) {
        return fileBytes;
      }
    } catch {
      return fileBytes;
    }
  }

  try {
    const srcDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
    const pageCount = srcDoc.getPageCount();
    const newDoc = await PDFDocument.create();

    const countToCopy = Math.min(maxPages, pageCount);
    const pageIndices: number[] = [];
    for (let i = 0; i < countToCopy; i++) {
      pageIndices.push(i);
    }

    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((p) => newDoc.addPage(p));

    const savedBytes = await newDoc.save();
    return Buffer.from(savedBytes);
  } catch (err) {
    // If pdf-lib fails, return original buffer if under 15MB
    if (fileBytes.length <= 15 * 1024 * 1024) {
      return fileBytes;
    }
    throw new Error(`تعذر اقتصاص الصفحات الأولى من ملف PDF وحجمه (${(fileBytes.length / (1024 * 1024)).toFixed(1)}MB) يتجاوز الحد المسموح.`);
  }
}

/**
 * Analyzes a scanned or digital PDF document using Google Gemini Multimodal Vision & OCR
 */
export async function analyzeBookWithGemini(
  pdfBufferOrPath: string | Buffer,
  originalFilename?: string,
  providedApiKey?: string,
  providedCategories?: LibraryCategoryInfo[]
): Promise<AiExtractedBookMetadata | null> {
  const apiKey = providedApiKey?.trim() || (await getGeminiApiKey());
  if (!apiKey) {
    return null;
  }

  // Fetch actual categories defined in the library system
  const activeCategories = (providedCategories && providedCategories.length > 0)
    ? providedCategories
    : await getActiveCategories();

  const categoriesPromptList = activeCategories
    .map((c) => `- "${c.id}": ${c.name}${c.description ? ` (${c.description})` : ''}`)
    .join('\n');

  let pdfSliceBuffer: Buffer;
  if (typeof pdfBufferOrPath === 'string') {
    pdfSliceBuffer = await slicePdfFirstPages(pdfBufferOrPath, 3);
  } else {
    // If it's already a buffer, check size
    if (pdfBufferOrPath.length > 15 * 1024 * 1024) {
      try {
        const srcDoc = await PDFDocument.load(pdfBufferOrPath, { ignoreEncryption: true });
        const newDoc = await PDFDocument.create();
        const countToCopy = Math.min(3, srcDoc.getPageCount());
        const pageIndices = Array.from({ length: countToCopy }, (_, i) => i);
        const copied = await newDoc.copyPages(srcDoc, pageIndices);
        copied.forEach((p) => newDoc.addPage(p));
        pdfSliceBuffer = Buffer.from(await newDoc.save());
      } catch {
        pdfSliceBuffer = pdfBufferOrPath;
      }
    } else {
      pdfSliceBuffer = pdfBufferOrPath;
    }
  }

  const base64Data = pdfSliceBuffer.toString('base64');

  const prompt = `
أنت خبير أرشيف وفهرسة وتصنيف مكتبي لمكتبة مؤسسية رقمية (نظام مشكاة).
أمامك الصفحات الأولى (الغلاف وصفحة العنوان والمقدمة) من كتاب رقمي/ممسوح ضوئياً بصيغة PDF.
اسم الملف الأصلي هو: "${originalFilename || 'غير معروف'}".

المطلوب: فحص وتفريغ نصوص الصفحات بصرياً (OCR) واستخراج بيانات الفهرسة والتصنيف بدقة بالغة.

المعايير الصارمة:
1. "title": عنوان الكتاب الصحيح والدقيق (باللغة الأصلية للكتاب: العربية أو الفرنسية أو الإنجليزية).
   - تجريد العنوان من عبارات النشر والمسح (مثل: مطبعة، دار، نسخة مصورة، tesseract).
   - إذا كان العنوان التراثي طويلاً، استخرج العنوان الشائع والمعتمد.
2. "author": اسم المؤلف أو الباحث الحقيقي (شخص).
   - في الرسائل والمذكرات الجامعية وأطروحات الدكتوراه والماجستير: استخرج اسم الطالب أو الباحث (الطالب / الباحثة / إعداد)، وتجنب تماماً وضع اسم المشرف أو لجنة المناقشة.
   - في أمهات الكتب التراثية: استخرج اسم العلامة/الشيخ/الإمام المصنّف، وإذا وجد محقق يمكن إضافته (تحقيق: ...).
   - تجنب إدراج أسماء الجامعات أو الكليات أو الوزارات كاسم مؤلف.
3. "categoryId": اختر كود ومعرّف (ID) التصنيف الأنسب لموضوع الكتاب حصراً من بين قائمة التصنيفات المعتمدة حالياً في النظام:
${categoriesPromptList}
4. "categoryName": اسم التصنيف المعتمد المختار أعلاه.
5. "summary": ملخص أكاديمي موجز من 1 إلى 3 جمل باللغة العربية الفصحى يوضح موضوع الكتاب وما يتناوله استناداً إلى العنوان والمقدمة.
6. "language": لغة الكتاب الأصلية ("ar" أو "fr" أو "en" أو "other").
7. "confidence": رقم صحيح من 0 إلى 100 يعبر عن ثقتك في صحة البيانات المستخرجة.
8. "isScanned": قيمة منطقية (true إذا كانت الصفحات عبارة عن مسح ضوئي لصور ورقية، وfalse إذا كانت ملفاً رقمياً حديثاً).

أجب حصراً بصيغة JSON صالحة ومباشرة بدون أي شروح خارج كائن JSON.
الصيغة المطلوبة:
{
  "title": "عنوان الكتاب",
  "author": "اسم المؤلف",
  "categoryId": "${activeCategories[0]?.id || 'cat-general'}",
  "categoryName": "${activeCategories[0]?.name || 'عام'}",
  "summary": "ملخص موضوع الكتاب...",
  "language": "ar",
  "confidence": 95,
  "isScanned": true
}
`;

  let candidatesToTry: WorkingAiModel[] = cachedWorkingModel ? [cachedWorkingModel] : [];
  if (candidatesToTry.length === 0) {
    try {
      candidatesToTry = await discoverAvailableGeminiModels(apiKey);
    } catch {
      candidatesToTry = [
        { modelName: 'gemini-2.5-flash', apiVersion: 'v1' },
        { modelName: 'gemini-2.0-flash', apiVersion: 'v1' },
        { modelName: 'gemini-1.5-flash', apiVersion: 'v1' },
      ];
    }
  }

  let rawJsonText = '';
  let modelUsed = '';

  for (const candidate of candidatesToTry) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        ...(candidate.apiVersion ? { apiVersion: candidate.apiVersion } : {}),
      });
      const response = await ai.models.generateContent({
        model: candidate.modelName,
        contents: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data,
            },
          },
          prompt,
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      if (response && response.text) {
        rawJsonText = response.text.trim();
        modelUsed = candidate.modelName;
        cachedWorkingModel = candidate;
        break;
      }
    } catch (err: any) {
      console.warn(`[BookAI] Model ${candidate.modelName} attempt failed:`, err.message || err);
      const rawError = err.message || String(err);
      if (err.status === 403 || /API key not valid|API_KEY_INVALID/i.test(rawError)) {
        // Invalid API Key, abort
        break;
      }
    }
  }

  if (!rawJsonText) {
    return null;
  }

  try {
    // Strip markdown code block wrappers if any
    const cleanedJson = rawJsonText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleanedJson);

    const title = parsed.title?.trim() || '';
    if (!title || title.length < 2) {
      return null;
    }

    // Resolve category dynamically against active system categories
    let matchedCat = activeCategories.find((c) => c.id === parsed.categoryId);
    if (!matchedCat && parsed.categoryName) {
      const normName = parsed.categoryName.trim();
      matchedCat = activeCategories.find((c) => c.name.includes(normName) || normName.includes(c.name));
    }
    const catId = matchedCat?.id || activeCategories[0]?.id || 'cat-general';
    const catName = matchedCat?.name || OFFICIAL_CATEGORIES[catId] || 'عام';

    return {
      title,
      author: parsed.author?.trim() || '',
      categoryId: catId,
      categoryName: catName,
      summary: parsed.summary?.trim() || '',
      language: ['ar', 'fr', 'en'].includes(parsed.language) ? parsed.language : 'ar',
      confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(10, parsed.confidence)) : 90,
      isScanned: Boolean(parsed.isScanned),
      modelUsed,
    };
  } catch (parseErr) {
    console.error('[BookAI] Failed to parse Gemini response JSON:', rawJsonText, parseErr);
    return null;
  }
}
