import fs from 'fs';
import path from 'path';

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

  // Author names in Arabic typically range between 3 and 50 characters
  if (clean.length >= 3 && clean.length <= 50) {
    return clean;
  }
  return null;
}

/**
 * Extracts author from normalized text extracted from document pages 1 & 2
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
 * Extracts author from a PDF document by inspecting pages 1-2 (and metadata)
 */
async function extractAuthorFromPdf(filePath: string): Promise<string | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const buffer = fs.readFileSync(filePath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

    let combinedText = '';
    const maxPagesToCheck = Math.min(3, doc.numPages);

    for (let pageNum = 1; pageNum <= maxPagesToCheck; pageNum++) {
      try {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageStr = textContent.items
          .map((item: any) => item.str || '')
          .join(' ');
        combinedText += ` ${pageStr}`;
      } catch {}
    }

    // Try text pattern extraction from page 1-2
    const extractedFromText = extractAuthorFromText(combinedText);
    if (extractedFromText) {
      return extractedFromText;
    }

    // Check PDF internal metadata as secondary fallback
    try {
      const meta = await doc.getMetadata();
      const metaAuthor = meta.info?.Author;
      if (metaAuthor && typeof metaAuthor === 'string') {
        const clean = metaAuthor.trim();
        // Ignore generic generator names
        const genericGenerators = ['microsoft', 'word', 'adobe', 'acrobat', 'writer', 'distiller', 'pdf', 'user', 'admin', 'unknown'];
        const isGeneric = genericGenerators.some(g => clean.toLowerCase().includes(g));
        if (!isGeneric && clean.length >= 3 && clean.length <= 50) {
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

    // Look for OPF package file
    const opfFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.opf'));
    if (!opfFile) return null;

    const opfContent = await zip.files[opfFile].async('string');

    // Extract <dc:creator>...</dc:creator>
    const creatorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    if (creatorMatch && creatorMatch[1]) {
      const clean = cleanAuthorName(creatorMatch[1]);
      if (clean) return clean;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * High-level helper: Extracts author from document pages 1 & 2 or metadata
 */
export async function extractAuthorFromDocument(
  filePath: string,
  format: 'pdf' | 'epub'
): Promise<{ author: string | null; method: 'pages_content' | 'metadata' | 'epub_creator' | null }> {
  try {
    if (format === 'epub') {
      const epubAuthor = await extractAuthorFromEpub(filePath);
      if (epubAuthor) {
        return { author: epubAuthor, method: 'epub_creator' };
      }
    } else {
      const pdfAuthor = await extractAuthorFromPdf(filePath);
      if (pdfAuthor) {
        return { author: pdfAuthor, method: 'pages_content' };
      }
    }
  } catch {}

  return { author: null, method: null };
}
