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

const OFFICIAL_CATEGORIES: Record<string, string> = {
  'cat-islamic': 'العلوم الشرعية والفكر الإسلامي',
  'cat-arabic': 'اللغة العربية وآدابها',
  'cat-history': 'التاريخ والحضارة والآثار',
  'cat-science': 'العلوم الطبيعية والتكنولوجيا',
  'cat-education': 'التربية ومناهج البحث العلمي',
  'cat-general': 'الثقافة العامة والتطوير الذاتي',
};

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

/**
 * Tests Gemini connectivity and API Key validity
 */
export async function testGeminiConnection(
  customApiKey?: string
): Promise<{ success: boolean; message: string; model?: string; error?: string }> {
  const key = customApiKey?.trim() || (await getGeminiApiKey());
  if (!key) {
    return {
      success: false,
      message: 'لم يتم توفير مفتاح Google Gemini API. يرجى إدخال المفتاح أولاً.',
    };
  }

  const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
  let lastError = '';

  for (const modelName of modelsToTry) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          'أجب بكلمة واحدة فقط: جاهز'
        ],
      });

      if (response && response.text) {
        return {
          success: true,
          message: `تم التحقق بنجاح! الاتصال بمحرك الذكاء الاصطناعي Google Gemini (${modelName}) نشط ومستعد لفحص وتصنيف الكتب.`,
          model: modelName,
        };
      }
    } catch (err: any) {
      lastError = err.message || String(err);
      if (err.status === 400 || err.status === 403) {
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
  providedApiKey?: string
): Promise<AiExtractedBookMetadata | null> {
  const apiKey = providedApiKey?.trim() || (await getGeminiApiKey());
  if (!apiKey) {
    return null;
  }

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
3. "categoryId": اختر كود التصنيف المناسب بدقة من بين الفئات الست المعتمدة حصراً:
   - "cat-islamic": العلوم الشرعية والفكر الإسلامي (فقه، عقيدة، حديث، تفسير، أصول، فتاوى، تصوف، سيرة نبوية، دراسات إسلامية).
   - "cat-arabic": اللغة العربية وآدابها (نحو، صرف، بلاغة، معاجم، شعر، أدب، نقد، رواية، قصة).
   - "cat-history": التاريخ والحضارة والآثار (سير وتراجم، وفيات، تاريخ عام، تاريخ عمان، حضارات، جغرافيا تاريخية، وثائق).
   - "cat-science": العلوم الطبيعية والتكنولوجيا (فيزياء، كيمياء، أحياء، طب، هندسة، تقنية، حاسوب، ذكاء اصطناعي، رياضيات).
   - "cat-education": التربية ومناهج البحث العلمي (طرق تدريس، علم نفس تربوي، توجيه مدرسي، مناهج بحث).
   - "cat-general": الثقافة العامة والتطوير الذاتي (موسوعات، تنمية ذاتية، فكر عام، إدارة).
4. "categoryName": الاسم العربي للفئة المختارة أعلاه.
5. "summary": ملخص أكاديمي موجز من 1 إلى 3 جمل باللغة العربية الفصحى يوضح موضوع الكتاب وما يتناوله استناداً إلى العنوان والمقدمة.
6. "language": لغة الكتاب الأصلية ("ar" أو "fr" أو "en" أو "other").
7. "confidence": رقم صحيح من 0 إلى 100 يعبر عن ثقتك في صحة البيانات المستخرجة.
8. "isScanned": قيمة منطقية (true إذا كانت الصفحات عبارة عن مسح ضوئي لصور ورقية، وfalse إذا كانت ملفاً رقمياً حديثاً).

أجب حصراً بصيغة JSON صالحة ومباشرة بدون أي شروح خارج كائن JSON.
الصيغة المطلوبة:
{
  "title": "عنوان الكتاب",
  "author": "اسم المؤلف",
  "categoryId": "cat-islamic",
  "categoryName": "العلوم الشرعية والفكر الإسلامي",
  "summary": "ملخص موضوع الكتاب...",
  "language": "ar",
  "confidence": 95,
  "isScanned": true
}
`;

  const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
  let rawJsonText = '';
  let modelUsed = '';

  for (const modelName of modelsToTry) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: modelName,
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
        modelUsed = modelName;
        break;
      }
    } catch (err: any) {
      console.warn(`[BookAI] Model ${modelName} attempt failed:`, err.message || err);
      if (err.status === 400 || err.status === 403) {
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

    const catId = OFFICIAL_CATEGORIES[parsed.categoryId] ? parsed.categoryId : 'cat-general';
    const catName = OFFICIAL_CATEGORIES[catId];

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
