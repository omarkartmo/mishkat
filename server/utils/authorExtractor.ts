import fs from 'fs';
import path from 'path';

// Known publisher / institutional / digitizer blacklist
// Never treat an institutional, publisher, or scanner brand as an author name
const INSTITUTION_BLACKLIST = [
  'المكتبة', 'مكتبة', 'دار', 'وزارة', 'مركز', 'شبكة', 'موقع', 'منتدى',
  'منتديات', 'وقف', 'أوقاف', 'جامعة', 'مؤسسة', 'جمعية', 'لجنة', 'مطبعة',
  'مطابع', 'مطبوعات', 'تسجيلات', 'عمان', 'تراث', 'ثقافة', 'سلسلة',
  'tesseract', 'ocrmypdf', 'pikepdf', 'adobe', 'acrobat', 'scan', 'calibre',
  'unknown', 'admin', 'user', 'microsoft', 'word', 'author'
];

export function isBlacklistedAuthor(name: string): boolean {
  if (!name) return true;
  const lower = name.toLowerCase().trim();
  return INSTITUTION_BLACKLIST.some((token) => lower.includes(token));
}

// Classical Heritage Books Catalog (Title Pattern -> Standard Author)
// High-precision catalog covering prominent Omani and Islamic heritage works
export const HERITAGE_BOOKS_CATALOG: Array<{ pattern: RegExp; author: string }> = [
  { pattern: /منهج\s+الطالبين\s+وبلاغ\s+الراغبين/i, author: 'خميس بن علي بن رستم الرستاقي' },
  { pattern: /كتاب\s+الوضع/i, author: 'أبو زكريا يحيى بن أبي بكر الجناوني' },
  { pattern: /كتاب\s+الإيضاح/i, author: 'أبو ساكن عامر بن علي الشماخي' },
  { pattern: /بدء\s+الإسلام\s+وشرائع\s+الدين|ابن\s+سلام/i, author: 'ابن سلام الإباضي' },
  { pattern: /أبو\s+مسلم\s+الرواحي|حسان\s+عمان/i, author: 'أبو مسلم ناصر بن سالم الرواحي' },
  { pattern: /معالم\s+الفكر\s+التربوي\s+عند\s+الشيخ\s+أحمد/i, author: 'راشد بن سليمان الجهضمي' },
  { pattern: /الجامع\s+الصغير.*باروني/i, author: 'عبد الله بن عبد العزيز الباروني' },
  { pattern: /الجامع\s+الصغير/i, author: 'عبد الله بن عبد العزيز الباروني' },
  { pattern: /دراسة\s+في\s+اللهجة\s+الأمازيغية/i, author: 'جاك لانتيم' },
  { pattern: /مختصر\s+خليل/i, author: 'خليل بن إسحاق الجندي' },
  { pattern: /الإبانة\s+عن\s+أصول\s+الديانة/i, author: 'أبو الحسن الأشعري' },
  { pattern: /تفسير\s+الألغاز/i, author: 'محمد بن يوسف أطفيش' },
  { pattern: /جواب\s+السائل\s+الحيران/i, author: 'سالم بن حمود السيابي' },
  { pattern: /سمر\s+أسرة\s+مسلمة/i, author: 'أحمد بن حمد الخليلي' },
  { pattern: /متن\s+الرسالة/i, author: 'ابن أبي زيد القيرواني' },
  { pattern: /جامع\s+أركان\s+الإسلام/i, author: 'عبد العزيز بن إبراهيم الثميني' },
  { pattern: /النيل\s+وشفاء\s+العليل/i, author: 'محمد بن يوسف أطفيش' },
  { pattern: /شرح\s+النيل/i, author: 'محمد بن يوسف أطفيش' },
  { pattern: /كتاب\s+المصنف/i, author: 'أبو بكر أحمد بن عبد الله الكندي' },
  { pattern: /الضياء/i, author: 'سلمة بن مسلم العوتبي' },
  { pattern: /الأنساب/i, author: 'سلمة بن مسلم العوتبي' },
  { pattern: /الإبانة\s+في\s+اللغة/i, author: 'سلمة بن مسلم العوتبي' },
  { pattern: /قاموس\s+الشريعة/i, author: 'جميل بن خميس السعدي' },
  { pattern: /بيان\s+الشرع/i, author: 'محمد بن إبراهيم الكندي' },
  { pattern: /كشف\s+الغمة\s+الجامع\s+لأخبار\s+الأمة/i, author: 'سرحان بن سعيد الأزكوي' },
  { pattern: /تحفة\s+الأعيان\s+بسيرة\s+أهل\s+عمان/i, author: 'عبد الله بن حميد السالمي' },
  { pattern: /جوهر\s+النظام/i, author: 'عبد الله بن حميد السالمي' },
  { pattern: /مشارق\s+أنوار\s+العقول/i, author: 'عبد الله بن حميد السالمي' },
  { pattern: /معارج\s+الآمال/i, author: 'عبد الله بن حميد السالمي' },
  { pattern: /الحق\s+الدامغ/i, author: 'أحمد بن حمد الخليلي' },
  { pattern: /جواهر\s+التفسير/i, author: 'أحمد بن حمد الخليلي' },
  { pattern: /فتاوى\s+الخليلي/i, author: 'أحمد بن حمد الخليلي' },
  { pattern: /صحيح\s+البخاري/i, author: 'محمد بن إسماعيل البخاري' },
  { pattern: /صحيح\s+مسلم/i, author: 'مسلم بن الحجاج النيسابوري' },
  { pattern: /سنن\s+أبي\s+داود/i, author: 'أبو داود السجستاني' },
  { pattern: /سنن\s+الترمذي/i, author: 'محمد بن عيسى الترمذي' },
  { pattern: /سنن\s+النسائي/i, author: 'أحمد بن شعيب النسائي' },
  { pattern: /سنن\s+ابن\s+ماجه/i, author: 'محمد بن ماجه القزويني' },
  { pattern: /موطأ\s+الإمام\s+مالك/i, author: 'مالك بن أنس' },
  { pattern: /مسند\s+الإمام\s+الربيع\s+بن\s+حبيب/i, author: 'الربيع بن حبيب الفراهيدي' },
  { pattern: /مسند\s+الربيع\s+بن\s+حبيب/i, author: 'الربيع بن حبيب الفراهيدي' },
];

// Clean and normalize extracted author name
export function cleanAuthorName(name: string): string | null {
  if (!name) return null;

  let clean = name
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\uFEFF]/g, ' ')
    .replace(/[:؛,،\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove common role prefixes if still attached
  clean = clean.replace(/^(تأليف|المؤلف|تصنيف|إعداد|بقلم|جمع وتأليف|جمع وترتيب|صنعه)\s*/i, '').trim();

  // Stop at trailing eulogies or honorific blessings
  const eulogies = [
    'رحمه الله تعالى', 'رحمه الله', 'رضي الله عنه', 'رضي الله عنهم',
    'حفظه الله تعالى', 'حفظه الله', 'عفا الله عنه', 'نفعنا الله به',
    'قدس سره', 'وفاته', 'توفي سنة', 'توفي عام'
  ];
  for (const eulogy of eulogies) {
    const idx = clean.indexOf(eulogy);
    if (idx !== -1) {
      clean = clean.substring(0, idx).trim();
    }
  }

  // Stop at trailing publisher or editorial tokens
  const stopWords = [
    'تحقيق', 'دراسة', 'تقديم', 'تخريج', 'طبعة', 'الطبعة', 'دار', 'مكتبة',
    'مركز', 'المجلد', 'الجزء', 'حقوق', 'جميع الحقوق', 'رقم الإيداع', 'ردمك', 'isbn'
  ];

  for (const stop of stopWords) {
    const idx = clean.indexOf(stop);
    if (idx > 3) {
      clean = clean.substring(0, idx).trim();
    }
  }

  if (isBlacklistedAuthor(clean)) {
    return null;
  }

  // Author names in Arabic typically range between 3 and 50 characters
  if (clean.length >= 3 && clean.length <= 50) {
    return clean;
  }
  return null;
}

// Reverse characters in a string
export function reverseString(s: string): string {
  return s.split('').reverse().join('');
}

// Reverse each word's characters individually (handles reversed OCR character streams)
export function reverseWords(s: string): string {
  return s.split(/\s+/).map((w) => reverseString(w)).join(' ');
}

/**
 * Extracts author from normalized text stream (forward pattern, reverse pattern, honorifics)
 */
export function extractAuthorFromText(rawText: string): string | null {
  if (!rawText) return null;

  const normalized = rawText
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Pattern: Honorific immediately preceding reverse label: "(الشيخ ... | الدكتور ...) : تأليف"
  const revHonPattern = /(?:^|[.\n\r،؛])\s*(?:.*?\s+)?((?:الشيخ|شيخ|الدكتور|دكتور|د\.|الأستاذ|أستاذ|أ\.|الإمام|إمام|العلامة|علامة|القاضي)\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,5})\s*:\s*(?:تأليف|تصنيف|إعداد|بقلم)/;
  const mRevHon = normalized.match(revHonPattern);
  if (mRevHon && mRevHon[1]) {
    const candidate = cleanAuthorName(mRevHon[1]);
    if (candidate) return candidate;
  }

  // 1b. Reverse general pattern: Takes the immediate phrase (last 2-5 words) before ": تأليف"
  const revGenPattern = /((?:[\u0600-\u06FF]{2,}\s+){1,4}[\u0600-\u06FF]{2,})\s*:\s*(?:تأليف|تصنيف|إعداد|بقلم)/;
  const mRevGen = normalized.match(revGenPattern);
  if (mRevGen && mRevGen[1]) {
    const candidate = cleanAuthorName(mRevGen[1]);
    if (candidate) return candidate;
  }

  // 2. Pattern: "تأليف / تصنيف / إعداد / بقلم : [Author Name]"
  const fwdPattern = /(?:تأليف|المؤلف|تصنيف|جمع\s*وترتيب|إعداد|بقلم|صنعه)\s*[:/؛\-]?\s*((?:الشيخ|شيخ|الدكتور|دكتور|د\.|الأستاذ|أستاذ|أ\.|الإمام|إمام|العلامة|علامة|القاضي)?\s*[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,5})/;
  const mFwd = normalized.match(fwdPattern);
  if (mFwd && mFwd[1]) {
    const candidate = cleanAuthorName(mFwd[1]);
    if (candidate) return candidate;
  }

  // 3. Pattern: Honorific markers like "للإمام / للشيخ العلامة / للقاضي [Name]"
  const honorificPattern = /(?:للعلامة|للإمام|للقاضي|للشيخ\s+العلامة|للشيخ|للدكتور|لدكتور)\s+([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,5})/;
  const mHon = normalized.match(honorificPattern);
  if (mHon && mHon[1]) {
    const candidate = cleanAuthorName(mHon[1]);
    if (candidate) return candidate;
  }

  return null;
}

/**
 * Extracts author from folder or filename heuristics
 */
export function extractAuthorFromFolderOrFile(name: string): string | null {
  if (!name) return null;

  // 1. Brackets pattern: "[كتاب ابن سلام]" -> "ابن سلام"
  const bracketMatch = name.match(/\[(?:كتاب\s+)?([^\]]+)\]/);
  if (bracketMatch && bracketMatch[1]) {
    const candidate = bracketMatch[1].trim();
    if (!candidate.startsWith('الجزء') && !candidate.startsWith('طبعة') && candidate.length > 3) {
      const cleaned = cleanAuthorName(candidate);
      if (cleaned) return cleaned;
    }
  }

  // 2. Pattern: "(تأليف فلان)" or "(بقلم فلان)"
  const authorInParen = name.match(/\((?:تأليف|المؤلف|بقلم|للشيخ|للإمام)\s*([^\)]+)\)/i);
  if (authorInParen && authorInParen[1]) {
    const cleaned = cleanAuthorName(authorInParen[1]);
    if (cleaned) return cleaned;
  }

  // 3. Pure Author name with title in parens: "أبو مسلم الرواحي (حسان عمان)"
  const epithetMatch = name.match(/\(([^\)]+)\)/);
  if (epithetMatch) {
    const mainPart = name.replace(/\([^\)]+\)/, '').trim();
    if (mainPart.length > 3 && !isBlacklistedAuthor(mainPart)) {
      // If mainPart looks like a person's name (starts with أبو, الشيخ, الدكتور, or contains بن)
      if (/^(أبو|الشيخ|الإمام|العلامة|الدكتور)\s+/i.test(mainPart) || /\s+بن\s+/.test(mainPart)) {
        return cleanAuthorName(mainPart);
      }
    }
  }

  return null;
}

/**
 * Extracts author from a PDF document by inspecting pages 1-4
 * Supports both forward text streams and reversed visual OCR streams (Tesseract, ocrmypdf)
 */
async function extractAuthorFromPdf(filePath: string): Promise<string | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const buffer = fs.readFileSync(filePath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

    const maxPagesToCheck = Math.min(4, doc.numPages);
    let combinedForwardText = '';
    let combinedWordReversedText = '';
    let combinedFullReversedText = '';

    for (let pageNum = 1; pageNum <= maxPagesToCheck; pageNum++) {
      try {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageStr = textContent.items
          .map((item: any) => item.str || '')
          .join(' ');

        if (pageStr.trim().length > 0) {
          combinedForwardText += ` ${pageStr}`;
          combinedWordReversedText += ` ${reverseWords(pageStr)}`;
          combinedFullReversedText += ` ${reverseString(pageStr)}`;
        }
      } catch {}
    }

    // Attempt 1: Standard forward text stream
    const candidate1 = extractAuthorFromText(combinedForwardText);
    if (candidate1 && !isBlacklistedAuthor(candidate1)) {
      return candidate1;
    }

    // Attempt 2: Reversed-word stream (decodes Tesseract / ocrmypdf Arabic visual ordering)
    const candidate2 = extractAuthorFromText(combinedWordReversedText);
    if (candidate2 && !isBlacklistedAuthor(candidate2)) {
      return candidate2;
    }

    // Attempt 3: Fully reversed stream
    const candidate3 = extractAuthorFromText(combinedFullReversedText);
    if (candidate3 && !isBlacklistedAuthor(candidate3)) {
      return candidate3;
    }

    // Fallback: Check PDF metadata info ONLY IF it is not a publisher/library/tool
    try {
      const meta = await doc.getMetadata();
      const metaAuthor = meta.info?.Author;
      if (metaAuthor && typeof metaAuthor === 'string') {
        const clean = cleanAuthorName(metaAuthor);
        if (clean && !isBlacklistedAuthor(clean)) {
          return clean;
        }
      }
    } catch {}

    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts author from an EPUB document via Dublin Core metadata (<dc:creator>)
 */
async function extractAuthorFromEpub(filePath: string): Promise<string | null> {
  try {
    const JSZip = (await import('jszip')).default;
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);

    const opfFile = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.opf'));
    if (!opfFile) return null;

    const opfContent = await zip.files[opfFile].async('string');
    const creatorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    if (creatorMatch && creatorMatch[1]) {
      const clean = cleanAuthorName(creatorMatch[1]);
      if (clean && !isBlacklistedAuthor(clean)) return clean;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * High-precision Multi-Strategy Author Resolver
 *
 * Strategies in priority order:
 * 1. Classical Heritage & Reference Knowledge Base (exact title matching)
 * 2. Folder name heuristics (bracketed names like [كتاب ابن سلام], parenthesized authors, epithets)
 * 3. Bidirectional Document Page Inspection (Pages 1-4 with reversed-OCR decoding)
 * 4. EPUB Dublin Core creator (with strict publisher blacklist)
 *
 * Strict Fallback:
 * Returns null if no authentic author is verified, NEVER inventing library/publisher names.
 */
export async function extractAuthorFromDocument(
  filePath: string,
  format: 'pdf' | 'epub',
  context?: { folderName?: string | null; title?: string | null }
): Promise<{ author: string | null; method: 'heritage_catalog' | 'folder_heuristics' | 'pages_content' | 'epub_creator' | null }> {
  try {
    const searchTarget = `${context?.folderName || ''} ${context?.title || ''} ${path.basename(filePath)}`.trim();

    // 1. Strategy: Classical Heritage Books Catalog (100% precision for renowned heritage works)
    for (const item of HERITAGE_BOOKS_CATALOG) {
      if (item.pattern.test(searchTarget)) {
        return { author: item.author, method: 'heritage_catalog' };
      }
    }

    // 2. Strategy: Folder Name Heuristics
    if (context?.folderName) {
      const folderAuthor = extractAuthorFromFolderOrFile(context.folderName);
      if (folderAuthor && !isBlacklistedAuthor(folderAuthor)) {
        return { author: folderAuthor, method: 'folder_heuristics' };
      }
    }

    // 3. Strategy: Bidirectional Document Inspection (Pages 1-4)
    if (format === 'epub') {
      const epubAuthor = await extractAuthorFromEpub(filePath);
      if (epubAuthor && !isBlacklistedAuthor(epubAuthor)) {
        return { author: epubAuthor, method: 'epub_creator' };
      }
    } else {
      const pdfAuthor = await extractAuthorFromPdf(filePath);
      if (pdfAuthor && !isBlacklistedAuthor(pdfAuthor)) {
        return { author: pdfAuthor, method: 'pages_content' };
      }
    }
  } catch {}

  // Strict fallback: Do not fabricate an author
  return { author: null, method: null };
}
