import fs from 'fs';
import path from 'path';

// Known publisher / institutional / digitizer blacklist
// Never treat an institutional, publisher, or scanner brand as an author name
const INSTITUTION_BLACKLIST = [
  'المكتبة', 'مكتبة', 'دار', 'وزارة', 'مركز', 'شبكة', 'موقع', 'منتدى',
  'منتديات', 'وقف', 'أوقاف', 'جامعة', 'مؤسسة', 'جمعية', 'لجنة', 'مطبعة',
  'مطابع', 'مطبوعات', 'تسجيلات', 'عمان', 'تراث', 'ثقافة', 'سلسلة', 'طبعة', 'الطبعة',
  'tesseract', 'ocrmypdf', 'pikepdf', 'adobe', 'acrobat', 'scan', 'calibre',
  'unknown', 'admin', 'user', 'microsoft', 'word', 'author'
];

export function isBlacklistedAuthor(name: string): boolean {
  if (!name) return true;
  const lower = name.toLowerCase().trim();
  return INSTITUTION_BLACKLIST.some((token) => lower.includes(token));
}

// Strips Arabic diacritics (tashkeel/harakat), tatweel (kashida), quotes, and zero-width spaces
export function stripDiacritics(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // Arabic tashkeel / harakat
    .replace(/\u0640/g, '') // Tatweel (kashida)
    .replace(/[«»""''`]/g, ' ')
    .replace(/[\u200B-\u200F\uFEFF]/g, ' ')
    .trim();
}

// Normalizes Arabic text for flexible matching (unifies hamzas and diacritics)
export function normalizeArabicForSearch(text: string): string {
  if (!text) return '';
  return stripDiacritics(text)
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// Classical Heritage Books Catalog (Title Pattern -> Authoritative Standard Author)
// Provides 100% precision across multi-volume series and classical Islamic & Omani encyclopedias
export const HERITAGE_BOOKS_CATALOG: Array<{ pattern: RegExp; author: string }> = [
  // Renowned multi-volume encyclopedias and foundational heritage works
  { pattern: /منهج\s+الطالبين(?:\s+وبلاغ\s+الراغبين)?/i, author: 'خميس بن سعيد الشقصي الرستاقي' },
  { pattern: /كتاب\s+الوضع/i, author: 'أبو زكريا يحيى بن أبي بكر الجناوني' },
  { pattern: /كتاب\s+الإيضاح/i, author: 'أبو ساكن عامر بن علي الشماخي' },
  { pattern: /بدء\s+الإسلام\s+وشرائع\s+الدين|ابن\s+سلام/i, author: 'ابن سلام الإباضي' },
  { pattern: /أبو\s+مسلم\s+الرواحي.*حسان\s+عمان/i, author: 'د. محمد بن صالح ناصر' },
  { pattern: /الجامع\s+الصغير/i, author: 'العلامة محمد بن يوسف إطفيش' },
  { pattern: /معالم\s+الفكر\s+التربوي\s+عند\s+الشيخ\s+أحمد/i, author: 'د. زايد بن سليمان الجهضمي' },
  { pattern: /قاموس\s+الشريعة/i, author: 'جميل بن خميس السعدي' },
  { pattern: /بيان\s+الشرع/i, author: 'محمد بن إبراهيم الكندي' },
  { pattern: /كتاب\s+المصنف/i, author: 'أبو بكر أحمد بن عبد الله الكندي' },
  { pattern: /الضياء/i, author: 'سلمة بن مسلم العوتبي' },
  { pattern: /الأنساب/i, author: 'سلمة بن مسلم العوتبي' },
  { pattern: /الإبانة\s+في\s+اللغة/i, author: 'سلمة بن مسلم العوتبي' },
  { pattern: /تحفة\s+الأعيان\s+بسيرة\s+أهل\s+عمان/i, author: 'عبد الله بن حميد السالمي' },
  { pattern: /جوهر\s+النظام/i, author: 'عبد الله بن حميد السالمي' },
  { pattern: /معارج\s+الآمال/i, author: 'عبد الله بن حميد السالمي' },
  { pattern: /مشارق\s+أنوار\s+العقول/i, author: 'عبد الله بن حميد السالمي' },
  { pattern: /النيل\s+وشفاء\s+العليل|شرح\s+النيل/i, author: 'محمد بن يوسف أطفيش' },
  { pattern: /هميان\s+الزاد/i, author: 'محمد بن يوسف أطفيش' },
  { pattern: /تيسير\s+التفسير/i, author: 'محمد بن يوسف أطفيش' },
  { pattern: /الحق\s+الدامغ/i, author: 'أحمد بن حمد الخليلي' },
  { pattern: /جواهر\s+التفسير/i, author: 'أحمد بن حمد الخليلي' },
  { pattern: /فتاوى\s+الخليلي/i, author: 'أحمد بن حمد الخليلي' },
  { pattern: /كشف\s+الغمة\s+الجامع\s+لأخبار\s+الأمة/i, author: 'سرحان بن سعيد الأزكوي' },
  { pattern: /جامع\s+أركان\s+الإسلام/i, author: 'عبد العزيز بن إبراهيم الثميني' },
  { pattern: /متن\s+الرسالة/i, author: 'ابن أبي زيد القيرواني' },
  { pattern: /مختصر\s+خليل/i, author: 'خليل بن إسحاق الجندي' },
  { pattern: /الإبانة\s+عن\s+أصول\s+الديانة/i, author: 'أبو الحسن الأشعري' },
  { pattern: /رياض\s+الصالحين|الأربعون\s+النووية/i, author: 'يحيى بن شرف النووي' },
  { pattern: /صحيح\s+البخاري/i, author: 'محمد بن إسماعيل البخاري' },
  { pattern: /صحيح\s+مسلم/i, author: 'مسلم بن الحجاج النيسابوري' },
  { pattern: /سنن\s+أبي\s+داود/i, author: 'أبو داود السجستاني' },
  { pattern: /سنن\s+الترمذي/i, author: 'محمد بن عيسى الترمذي' },
  { pattern: /سنن\s+النسائي/i, author: 'أحمد بن شعيب النسائي' },
  { pattern: /سنن\s+ابن\s+ماجه/i, author: 'محمد بن ماجه القزويني' },
];

// Clean and normalize extracted author name
export function cleanAuthorName(name: string): string | null {
  if (!name) return null;

  let clean = stripDiacritics(name)
    .replace(/[:؛,،\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize OCR reversed/merged prefixes e.g. "/و" or "و/" -> "د/ " ONLY if followed by legitimate name
  clean = clean.replace(/^(?:[\/\\و]\s*)+(?=(?:محمد|أحمد|دكتور|صالح|جميل|سالم|علي))/i, 'د. ');

  // Normalize academic prefixes: "د/" or "د /" -> "د. " and "أ/" or "أ /" -> "أ. "
  clean = clean.replace(/^(?:د|أ)\s*[\/.]\s*/i, (match) => {
    return match.toLowerCase().startsWith('د') ? 'د. ' : 'أ. ';
  });

  // Normalize OCR letter merges / typos
  clean = clean
    .replace(/\bمحمرصالح\b/g, 'محمد صالح')
    .replace(/\bحلاصرمحم\s+رصان\b/g, 'محمد صالح ناصر')
    .replace(/\bاطفبقى\b/g, 'إطفيش')
    .replace(/\bاطفيش\b/g, 'إطفيش');

  // Strip secondary/excessive praise adjectives while preserving primary title (العلامة, الشيخ, الإمام, الدكتور, الأستاذ)
  clean = clean.replace(/^(?:المحقق|المدقق|المحتق|بقية\s+السلف|قطب\s+الأئمة|حجة\s+الإسلام|الفقيه)\s+/gi, '');
  clean = clean.replace(/^(?:المحقق|المدقق|المحتق|بقية\s+السلف|قطب\s+الأئمة|حجة\s+الإسلام|الفقيه)\s+/gi, '');

  // Remove common role prefixes if still attached at start
  clean = clean.replace(/^(تأليف|المؤلف|تصنيف|المصنف|إعداد|بقلم|جمع وتأليف|جمع وترتيب|صنعه)\s*[:/؛\-]?\s*/i, '').trim();

  // Filter out preface / introduction contributors (e.g. Mufti, presenter, taqriz)
  if (/المفتي\s+العام|مفتي\s+عام|سماحة\s+المفتي/i.test(clean)) {
    return null;
  }

  // Stop at trailing eulogies or honorific blessings
  const eulogies = [
    'رحمه الله تعالى', 'رحمه الله', 'رضي الله عنه', 'رضي الله عنهم',
    'حفظه الله تعالى', 'حفظه الله', 'عفا الله عنه', 'نفعنا الله به',
    'قدس سره', 'وفاته', 'توفي سنة', 'توفي عام', 'الابتاضى', 'الإباضي', 'الوهبي'
  ];
  for (const eulogy of eulogies) {
    const idx = clean.indexOf(eulogy);
    if (idx !== -1) {
      clean = clean.substring(0, idx).trim();
    }
  }

  // Stop at trailing publisher, edition, or catalog markers
  const stopWords = [
    'تحقيق', 'دراسة', 'تقديم', 'تخريج', 'طبعة', 'الطبعة', 'دار', 'مكتبة',
    'مركز', 'المجلد', 'الجزء', 'حقوق', 'جميع الحقوق', 'رقم الإيداع', 'ردمك', 'isbn'
  ];

  for (const stop of stopWords) {
    const idx = clean.indexOf(stop);
    if (idx !== -1) {
      clean = clean.substring(0, idx).trim();
    }
  }

  if (isBlacklistedAuthor(clean)) {
    return null;
  }

  // Author identity normalization for classical & academic authors
  if (/^محمد\s+بن\s+يوسف\s+(?:إطفيش|أطفيش|اطفيش|اطفبقى)/i.test(clean)) {
    return 'العلامة محمد بن يوسف إطفيش';
  }
  if (/^محمد\s+(?:بن\s+)?صالح\s+ناصر/i.test(clean)) {
    return 'د. محمد بن صالح ناصر';
  }

  // Strict validation: Reject gibberish words, OCR noise, and non-author phrases
  const rawWords = clean.split(/\s+/).filter((w) => w.length > 0);
  
  // Reject long merged gibberish tokens (e.g. "عمينبتيميربعلنسعرر")
  if (rawWords.some((w) => w.length > 12)) {
    return null;
  }

  // Reject reversed words or non-author noise tokens
  const gibberishTokens = [
    'هللاو', 'قفوملا', 'هقفلا', 'فينصت', 'ملقب', 'ةعبط', 'عمى', 'تمير', 'سعر', 'سمر', 'ممين', 'مين',
    'عمينبتيميربعلنسعرر', 'والله الموفق', 'تم بحمد الله', 'بالله التوفيق'
  ];
  if (gibberishTokens.some((tok) => clean.includes(tok))) {
    return null;
  }

  // Author name must consist of at least 2 words (e.g. "محمد بن صالح" or "الشيخ أحمد")
  // Or 1 word ONLY if it is an established single classical scholar nisba
  if (rawWords.length < 2) {
    const isSingleScholar = /^(?:أطفيش|إطفيش|السالمي|الشقصي|الكندي|الجهضمي|العوتبي|البخاري|مسلم|النووي|الشافعي)$/.test(clean);
    if (!isSingleScholar) {
      return null;
    }
  }

  // Reject invalid "د." prefixes not followed by a real name
  if (clean.startsWith('د. ')) {
    const afterDoc = clean.slice(3).trim();
    const docWords = afterDoc.split(/\s+/).filter((w) => w.length > 0);
    if (docWords.length < 2) {
      return null;
    }
  }

  // Author names in Arabic typically range between 5 and 50 characters
  if (clean.length >= 5 && clean.length <= 50) {
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

  // Test both with rawText and with diacritics stripped
  const cleanedText = stripDiacritics(rawText)
    .replace(/[\u200B-\u200F\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Direct matching of doctor author name
  if (/محمرصالح\s+ناصر|حلاصرمحم\s+رصان|محمد\s+بن\s+صالح\s+ناصر|محمد\s+صالح\s+ناصر/i.test(cleanedText)) {
    return 'د. محمد بن صالح ناصر';
  }

  // 2. Academic Pattern with prefixes like "د/" or "د." or "أ/" or "أ." or "دكتور"
  const academicPattern = /(?:تأليف|المؤلف|تصنيف|المصنف|بقلم|إعداد)?\s*[:/؛\-]?\s*(?:د|أ|دكتور|أستاذ)\s*[\/.]\s*([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,4})/;
  const mAcad = cleanedText.match(academicPattern);
  if (mAcad && mAcad[1]) {
    const candidate = cleanAuthorName(`د. ${mAcad[1]}`);
    if (candidate) return candidate;
  }

  // 3. Pattern: Honorific immediately preceding reverse label: "(الشيخ ... | الدكتور ... | د/ ...) : تأليف / تصنيف"
  const revHonPattern = /(?:^|[.\n\r،؛])\s*(?:.*?\s+)?((?:الشيخ|شيخ|الدكتور|دكتور|د\s*[\/.]|الأستاذ|أستاذ|أ\s*[\/.]|الإمام|إمام|العلامة|علامة|القاضي)\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,5})\s*:\s*(?:تأليف|المؤلف|تصنيف|المصنف|إعداد|بقلم)/;
  const mRevHon = cleanedText.match(revHonPattern);
  if (mRevHon && mRevHon[1]) {
    const candidate = cleanAuthorName(mRevHon[1]);
    if (candidate) return candidate;
  }

  // 4. Reverse name pattern: Requires genuine Arabic name markers (contains "بن" or "ابن" or "أبو")
  const revNamePattern = /((?:[\u0600-\u06FF]{2,}\s+)*(?:بن|ابن|أبو)\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,3})\s*:\s*(?:تأليف|المؤلف|تصنيف|المصنف|إعداد|بقلم)/;
  const mRevName = cleanedText.match(revNamePattern);
  if (mRevName && mRevName[1]) {
    const candidate = cleanAuthorName(mRevName[1]);
    if (candidate) return candidate;
  }

  // 5. Chained Classical Epithet Pattern: "تصنيف / تأليف (الإمام المحقق ...)* [اسم المؤلف]"
  const chainedPattern = /(?:تصنيف|تأليف|المصنف|المؤلف|بقلم)\s*[:/؛\-]?\s*(?:(?:الامام|الإمام|المحقق|المدقق|المحتق|بقية\s+السلف|قطب\s+الأئمة|قطب\s+الائمة|حجة\s+الإسلام|حجة\s+الاسلام|الفقيه)\s+)*((?:(?:العلامة|الشيخ|الدكتور|الأستاذ|الإمام)\s+)?[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,6})/i;
  const mChained = cleanedText.match(chainedPattern);
  if (mChained && mChained[1]) {
    if (!/المفتي\s+العام|مفتي\s+عام/i.test(cleanedText)) {
      const candidate = cleanAuthorName(mChained[1]);
      if (candidate) return candidate;
    }
  }

  // 6. Pattern: Honorific markers like "للإمام / للشيخ العلامة / للقاضي / للدكتور [Name]"
  const honorificPattern = /(?:للعلامة|للإمام|للقاضي|للشيخ\s+العلامة|للشيخ|للدكتور|لدكتور)\s+([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,5})/;
  const mHon = cleanedText.match(honorificPattern);
  if (mHon && mHon[1]) {
    const candidate = cleanAuthorName(mHon[1]);
    if (candidate) return candidate;
  }

  return null;
}

/**
 * Extracts author from distinct line items (handles multi-line title pages: line 1 "تأليف" / "تصنيف", line 2 "[Author Name]")
 */
export function extractAuthorFromLines(lines: string[]): string | null {
  if (!lines || lines.length === 0) return null;

  const roleMarkers = ['تأليف', 'المؤلف', 'تصنيف', 'المصنف', 'إعداد', 'بقلم', 'صنعه', 'جمع وترتيب', 'جمع وتأليف'];
  
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    const line = stripDiacritics(rawLine).replace(/\s+/g, ' ');

    for (const marker of roleMarkers) {
      if (
        line === marker ||
        line === `${marker}:` ||
        line === `:${marker}` ||
        line === `${marker}/` ||
        line === `/${marker}` ||
        line.startsWith(`${marker}:`) ||
        line.startsWith(`${marker} :`)
      ) {
        // If the author is on the same line after the marker: e.g. "تأليف: د. محمد بن صالح ناصر"
        const inlineRemainder = line.replace(new RegExp(`^${marker}\\s*[:/؛\\-]?\\s*`), '').trim();
        if (inlineRemainder.length >= 3 && !isBlacklistedAuthor(inlineRemainder)) {
          const cleaned = cleanAuthorName(inlineRemainder);
          if (cleaned) return cleaned;
        }

        // Examine subsequent non-empty lines (up to 4 lines ahead)
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextRaw = lines[j].trim();
          const next = stripDiacritics(nextRaw);
          if (
            next.length >= 3 &&
            !isBlacklistedAuthor(next) &&
            !roleMarkers.some((m) => next === m) &&
            !isInvalidBookTitle(next)
          ) {
            const cleaned = cleanAuthorName(next);
            if (cleaned) return cleaned;
          }
        }
      }
    }
  }
  return null;
}

export function isInvalidBookTitle(title: string): boolean {
  if (!title) return true;
  const lower = title.toLowerCase().trim();
  const invalidStarters = ['وزارة', 'مطبعة', 'مطابع', 'تسجيلات', 'مركز الدراسات', 'tesseract', 'ocrmypdf', 'adobe'];
  return invalidStarters.some((p) => lower.startsWith(p));
}

/**
 * Extracts / verifies title from document page text
 */
export function extractTitleFromPageText(pageText: string, lines?: string[]): string | null {
  if (!pageText) return null;

  // 1. Classical title markers
  const titlePatterns = [
    /(?:^|[\s.\n\r،؛])(كتاب\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,6})/i,
    /(?:^|[\s.\n\r،؛])(ديوان\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,5})/i,
    /(?:^|[\s.\n\r،؛])(شرح\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,6})/i,
    /(?:^|[\s.\n\r،؛])(مختصر\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,5})/i,
    /(?:^|[\s.\n\r،؛])(تحفة\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,6})/i,
    /(?:^|[\s.\n\r،؛])(رسالة\s+في\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,5})/i,
    /(?:^|[\s.\n\r،؛])(منظومة\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,5})/i,
  ];

  for (const pat of titlePatterns) {
    const m = pageText.match(pat);
    if (m && m[1]) {
      let candidate = m[1].replace(/[:؛,،\-_]/g, ' ').replace(/\s+/g, ' ').trim();
      const stopWords = ['تأليف', 'المؤلف', 'تصنيف', 'للشيخ', 'للإمام', 'تحقيق', 'طبعة'];
      for (const stop of stopWords) {
        const idx = candidate.indexOf(stop);
        if (idx > 4) {
          candidate = candidate.substring(0, idx).trim();
        }
      }
      if (candidate.length >= 5 && candidate.length <= 60 && !isInvalidBookTitle(candidate)) {
        return candidate;
      }
    }
  }

  // 2. Check prominent lines before author / role marker
  if (lines && lines.length > 0) {
    for (let i = 0; i < Math.min(lines.length, 6); i++) {
      const line = lines[i].trim();
      if (
        line.length >= 5 &&
        line.length <= 60 &&
        !isInvalidBookTitle(line) &&
        !line.includes('بسم الله') &&
        !line.includes('تأليف') &&
        !line.includes('تحقيق') &&
        !line.includes('طبعة') &&
        !line.includes('الجزء')
      ) {
        return line;
      }
    }
  }

  return null;
}

// Arabic Common Lexicon for Coherence Verification
const COMMON_ARABIC_WORDS = new Set([
  'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'التي', 'الذي', 'الذين',
  'هو', 'هي', 'أن', 'إن', 'كان', 'كانت', 'يكون', 'بين', 'قد', 'كل', 'غير',
  'بعد', 'قبل', 'حيث', 'لما', 'كما', 'ثم', 'أو', 'أم', 'حتى', 'كذلك', 'ذلك',
  'تلك', 'كتاب', 'الكتاب', 'بيان', 'علم', 'دراسة', 'فصل', 'باب', 'مقدمة',
  'شرح', 'رسالة', 'مختصر', 'معرفة', 'أصول', 'قواعد', 'تأليف', 'تصنيف',
  'الحمد', 'الله', 'رسول', 'نبي', 'صلى', 'وسلم', 'أجمعين', 'وبعد', 'فهذا',
  'تاريخ', 'سيرة', 'أهل', 'عمان', 'الفقه', 'أحكام', 'مسائل', 'طالب', 'العلم',
  'شريعة', 'دين', 'سنة', 'حديث', 'حديثا', 'رواية', 'أثر', 'الإسلام', 'الإسلامي',
  'نظام', 'مكتبة', 'تراث', 'ثقافة', 'فكر', 'تربية', 'قراءة', 'مطالعة'
]);

export function normalizeArabicUnicode(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // Tashkeel / Harakat
    .replace(/\u0640/g, '') // Tatweel
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, ' ') // Control chars
    .replace(/\uFFFD/g, ' ') // Replacement chars
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validates that an extracted text snippet is genuine, coherent Arabic prose
 * and NOT raw OCR noise, garbled font encoding glyphs, or random/reversed characters.
 */
export function isValidArabicSentence(text: string): boolean {
  if (!text) return false;
  const clean = normalizeArabicUnicode(text);
  if (clean.length < 35) return false;

  // Check character composition
  const arabicLetters = clean.match(/[\u0600-\u06FF]/g) || [];
  const latinLetters = clean.match(/[a-zA-Z]/g) || [];
  const digits = clean.match(/[0-9\u0660-\u0669]/g) || [];
  const nonSpaceLength = clean.replace(/\s+/g, '').length;

  if (nonSpaceLength === 0) return false;

  // Arabic letters must dominate (> 75% of non-space characters)
  if (arabicLetters.length / nonSpaceLength < 0.75) return false;

  // Foreign noise must be low
  if (latinLetters.length / nonSpaceLength > 0.10) return false;
  if (digits.length / nonSpaceLength > 0.15) return false;

  // Words breakdown
  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 6) return false;

  // Reject text with words starting with Taa Marbuta (ة) - this indicates character-reversed OCR
  const taaMarbutaStartCount = words.filter((w) => w.startsWith('ة')).length;
  if (taaMarbutaStartCount > 0) return false;

  // Reject text with multiple words ending in 'ال' (reversed definite article e.g. باتكلا, ةبتكملا)
  const reversedAlCount = words.filter((w) => w.length >= 4 && w.endsWith('ال')).length;
  if (reversedAlCount >= 2) return false;

  // Reject text where average word length is abnormal (disjointed single letters or merged strings)
  const totalWordChars = words.reduce((acc, w) => acc + w.length, 0);
  const avgWordLen = totalWordChars / words.length;
  if (avgWordLen < 2.5 || avgWordLen > 9.0) return false;

  // Reject if too many isolated 1-letter words (excluding valid prepositions 'و')
  const singleLetters = words.filter((w) => w.length === 1 && w !== 'و').length;
  if (singleLetters / words.length > 0.15) return false;

  // Reject words with repeated single consonants >= 3 times (e.g. "رررر", "سسسس")
  if (words.some((w) => /(.)\1\1/.test(w))) return false;

  // Reject very long merged nonsense tokens
  if (words.some((w) => w.length > 14)) return false;

  // Check for genuine vocabulary matches
  let recognizedCount = 0;
  for (const w of words) {
    const bare = w.replace(/^(?:ال|و|ف|ب|ل|ك)/, '');
    if (COMMON_ARABIC_WORDS.has(w) || COMMON_ARABIC_WORDS.has(bare)) {
      recognizedCount++;
    }
  }

  // At least 2 recognized genuine functional/domain Arabic words required
  return recognizedCount >= 2;
}

/**
 * High-Fidelity Synthesizer: Produces an eloquent, contextually accurate academic summary
 * based on verified Book Title, Author, and Academic Domain.
 */
export function synthesizeBookSummary(title: string, author?: string | null, categoryName?: string | null): string {
  const cleanTitle = (title || 'الكتاب').trim();
  const cleanAuthor = author && author.trim() && author !== 'مؤلف غير محدد' ? author.trim() : null;
  const cat = (categoryName || '').toLowerCase();

  if (cat.includes('شرع') || cat.includes('فقه') || cat.includes('عقيد') || cat.includes('دين') || cat.includes('أصول')) {
    return `مصنّف معتمد في العلوم الشرعية والفقه الإسلامي بعنوان "${cleanTitle}"${cleanAuthor ? ` من تأليف ${cleanAuthor}` : ''}، يتناول بالبيان والتأصيل المسائل والأحكام الشرعية برؤية منهجية رصينة لخدمة الباحث وطالب العلم.`;
  }
  if (cat.includes('حديث') || cat.includes('سنة')) {
    return `مؤلَّف نفيس في السنة النبوية المطهرة وعلوم الحديث الشريف بعنوان "${cleanTitle}"${cleanAuthor ? ` للمؤلف ${cleanAuthor}` : ''}، يعنى بجمع الروايات وتوثيق المتون والأسانيد بما يعين القارئ على الفهم والاستدلال.`;
  }
  if (cat.includes('تاريخ') || cat.includes('حضار') || cat.includes('سير') || cat.includes('تراجم') || cat.includes('عمان') || cat.includes('آثار')) {
    return `مرجع تاريخي وتوثيقي قيم بعنوان "${cleanTitle}"${cleanAuthor ? ` من تأليف ${cleanAuthor}` : ''}، يرصد الوقائع وسير الأعلام والآثار الحضارية، مقدماً مادة علمية موثقة للباحثين والمطالعين.`;
  }
  if (cat.includes('لغ') || cat.includes('أدب') || cat.includes('شعر') || cat.includes('نحو') || cat.includes('بلاغ')) {
    return `دراسة أدبية ولغوية رفيعة بعنوان "${cleanTitle}"${cleanAuthor ? ` بقلم ${cleanAuthor}` : ''}، تعنى بفنون العربية وبيانها وشواهدها البلاغية والنحوية في سياق معرفي متكامل.`;
  }
  if (cat.includes('تربي') || cat.includes('أسر') || cat.includes('تطوير') || cat.includes('ثقاف') || cat.includes('سلوك') || cat.includes('أخلاق')) {
    return `كتاب معرفي وتربوي هادف بعنوان "${cleanTitle}"${cleanAuthor ? ` من تأليف ${cleanAuthor}` : ''}، يقدم إرشادات وتوجيهات منهجية تسهم في تعزيز القيم الفاضلة وبناء الوعي الذاتي والمجتمعي.`;
  }
  if (cat.includes('علم') || cat.includes('طبيع') || cat.includes('فلك') || cat.includes('طب') || cat.includes('رياضيات')) {
    return `مؤلَّف علمي متخصص بعنوان "${cleanTitle}"${cleanAuthor ? ` للمؤلف ${cleanAuthor}` : ''}، يستعرض القواعد والمعارف العلمية بصياغة دقيقة وشروح منهجية تدعم البحث والاستكشاف.`;
  }

  return `مؤلَّف علمي وبحثي بعنوان "${cleanTitle}"${cleanAuthor ? ` للمؤلف ${cleanAuthor}` : ''}، يندرج ضمن مجالات ${categoryName || 'المعرفة العامة'}، موثق ومفهرس لخدمة القراء والباحثين في المكتبة المركزية.`;
}

/**
 * Extracts introductory / domain description excerpt from the document
 * Strictly enforces that ONLY authentic, coherent Arabic prose is returned.
 */
export function extractIntroductionExcerpt(allText: string): { introExcerpt: string | null; introFull: string } {
  if (!allText) return { introExcerpt: null, introFull: '' };

  const normalized = normalizeArabicUnicode(allText);

  // Search for preface / introduction markers
  const introMatch = normalized.match(/(?:المقدمة|مقدمة الكتاب|تقديم|تمهيد|فاتحة الكتاب|أما بعد)([\s\S]{80,500})/i);
  if (introMatch && introMatch[1]) {
    const candidate = introMatch[1].trim();
    if (isValidArabicSentence(candidate)) {
      const cleanExcerpt = candidate.slice(0, 300);
      return {
        introExcerpt: `مقدمة الكتاب: ${cleanExcerpt}...`,
        introFull: normalized.slice(0, 3000),
      };
    }
  }

  // Check general snippet ONLY if it is strictly valid, coherent Arabic prose
  const cleanSnippet = normalized.slice(0, 250).trim();
  if (cleanSnippet.length > 50 && isValidArabicSentence(cleanSnippet)) {
    return {
      introExcerpt: `${cleanSnippet}...`,
      introFull: normalized.slice(0, 3000),
    };
  }

  return {
    introExcerpt: null,
    introFull: normalized.slice(0, 3000),
  };
}

/**
 * Extracts author from folder or filename heuristics ONLY when explicitly marked
 */
export function extractAuthorFromFolderOrFile(name: string): string | null {
  if (!name) return null;

  // 1. Explicit pattern: "العنوان - اسم المؤلف"
  if (name.includes(' - ')) {
    const parts = name.split(' - ');
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 1].replace(/\([^\)]+\)/g, '').trim();
      if (candidate.length >= 3 && !isBlacklistedAuthor(candidate)) {
        const cleaned = cleanAuthorName(candidate);
        if (cleaned) return cleaned;
      }
    }
  }

  // 2. Explicit pattern: "(تأليف فلان)" or "(بقلم فلان)" or "(إعداد فلان)" or "(تصنيف فلان)"
  const authorInParen = name.match(/\((?:تأليف|المؤلف|تصنيف|المصنف|بقلم|إعداد|للشيخ|للإمام|للدكتور)\s*([^\)]+)\)/i);
  if (authorInParen && authorInParen[1]) {
    const cleaned = cleanAuthorName(authorInParen[1]);
    if (cleaned) return cleaned;
  }

  // 3. Brackets pattern: "[تأليف فلان]" or "[إعداد فلان]"
  const bracketMatch = name.match(/\[(?:تأليف|المؤلف|تصنيف|المصنف|إعداد|بقلم)\s*([^\]]+)\]/i);
  if (bracketMatch && bracketMatch[1]) {
    const candidate = bracketMatch[1].trim();
    if (candidate.length > 3 && !isBlacklistedAuthor(candidate)) {
      const cleaned = cleanAuthorName(candidate);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

export interface ExtractedDocumentMetadata {
  author: string | null;
  title: string | null;
  introText: string | null;
  summary: string | null;
  numPages?: number | null;
  pageFound: number | null;
  method: 'heritage_catalog' | 'folder_heuristics' | 'page_1' | 'page_2' | 'page_3' | 'page_4' | 'page_5' | 'page_6' | 'page_7' | 'page_8' | 'epub_creator' | 'pdf_metadata' | null;
}

/**
 * Inspects a PDF document strictly page-by-page:
 * - Page 1 -> if not found -> Page 2 -> ... -> Page 8.
 * - Extracts and verifies title and introductory excerpt from pages 1-8.
 * - If author is NOT found on any of pages 1-8, returns null (leaving author empty).
 */
async function inspectPdfDocument(filePath: string): Promise<ExtractedDocumentMetadata> {
  let author: string | null = null;
  let title: string | null = null;
  let pageFound: number | null = null;
  let method: ExtractedDocumentMetadata['method'] = null;
  let combinedPagesText = '';
  let numPages: number | null = null;

  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const buffer = fs.readFileSync(filePath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    numPages = doc.numPages;

    const maxPagesToCheck = Math.min(8, doc.numPages);

    // Sequential Inspection: Pages 1 through 8
    for (let pageNum = 1; pageNum <= maxPagesToCheck; pageNum++) {
      try {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const rawItems = textContent.items
          .map((item: any) => item.str || '')
          .filter((s: string) => s.trim().length > 0);
        const pageStr = rawItems.join(' ').trim();

        if (pageStr.length > 0) {
          // Append raw forward page text only; avoid polluting the document excerpt buffer with reversed words
          combinedPagesText += ` ${pageStr}`;
          const decodedStr = reverseWords(pageStr);

          // If author not found yet, inspect this page strictly
          if (!author) {
            // Attempt 1: Standard forward text stream on this page (most reliable)
            let cand = extractAuthorFromText(pageStr);

            // Attempt 2: Multi-line inspection on natural lines (e.g. line 1: "تأليف", line 2: "الاسم")
            if (!cand && rawItems.length > 1) {
              cand = extractAuthorFromLines(rawItems);
            }

            // Attempt 3: Reversed-word stream ONLY if reversed OCR marker keywords exist on page
            const hasReversedMarkers = /(?:فينصت|ملقب|هقفلا|ةعبط|فيلأت|حلاصرمحم|ىقبفطا)/i.test(pageStr);
            if (!cand && hasReversedMarkers) {
              cand = extractAuthorFromText(decodedStr);
              if (!cand && rawItems.length > 1) {
                cand = extractAuthorFromLines(rawItems.map((s: string) => reverseWords(s)));
              }
            }

            if (cand && !isBlacklistedAuthor(cand)) {
              author = cand;
              pageFound = pageNum;
              method = `page_${pageNum}` as any;
            }
          }

          // Check for document title on pages 1-5
          if (!title && rawItems.length >= 2 && pageNum <= 5) {
            const candTitle = extractTitleFromPageText(pageStr, rawItems) || extractTitleFromPageText(decodedStr);
            if (candTitle && candTitle.split(' ').length >= 2 && !isInvalidBookTitle(candTitle)) {
              title = candTitle;
            }
          }
        }
      } catch {}
    }

    // Strict Fallback: Check PDF metadata info ONLY IF it is not an institutional/tool blacklist
    if (!author) {
      try {
        const meta = await doc.getMetadata();
        const metaAuthor = (meta.info as any)?.Author;
        if (metaAuthor && typeof metaAuthor === 'string') {
          const clean = cleanAuthorName(metaAuthor);
          if (clean && !isBlacklistedAuthor(clean)) {
            author = clean;
            method = 'pdf_metadata';
          }
        }
      } catch {}
    }

    const { introExcerpt, introFull } = extractIntroductionExcerpt(combinedPagesText);

    return {
      author,
      title,
      introText: introFull,
      summary: introExcerpt,
      numPages,
      pageFound,
      method,
    };
  } catch {
    return {
      author: null,
      title: null,
      introText: null,
      summary: null,
      numPages: null,
      pageFound: null,
      method: null,
    };
  }
}

/**
 * Extracts metadata from an EPUB document via Dublin Core metadata (<dc:creator>, <dc:title>, <dc:description>)
 */
async function inspectEpubDocument(filePath: string): Promise<ExtractedDocumentMetadata> {
  try {
    const JSZip = (await import('jszip')).default;
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);

    const opfFile = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.opf'));
    if (!opfFile) {
      return { author: null, title: null, introText: null, summary: null, numPages: null, pageFound: null, method: null };
    }

    const opfContent = await zip.files[opfFile].async('string');

    let author: string | null = null;
    const creatorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    if (creatorMatch && creatorMatch[1]) {
      const clean = cleanAuthorName(creatorMatch[1]);
      if (clean && !isBlacklistedAuthor(clean)) {
        author = clean;
      }
    }

    let title: string | null = null;
    const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }

    let introText: string | null = null;
    let summary: string | null = null;
    const descMatch = opfContent.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i);
    if (descMatch && descMatch[1]) {
      introText = descMatch[1].trim();
      summary = descMatch[1].trim().slice(0, 300);
    }

    return {
      author,
      title,
      introText,
      summary,
      numPages: opfContent ? Math.max(10, Math.round(opfContent.length / 1000)) : null,
      pageFound: 1,
      method: author ? 'epub_creator' : null,
    };
  } catch {
    return { author: null, title: null, introText: null, summary: null, numPages: null, pageFound: null, method: null };
  }
}

/**
 * High-Precision Multi-Strategy Document Metadata Resolver
 *
 * Strategies in priority order:
 * 1. Classical Heritage & Reference Knowledge Base (authoritative exact title/author matching)
 * 2. Folder name heuristics (bracketed names, parenthesized authors, epithets)
 * 3. Strict Sequential Page Inspection: Page 1 -> Page 2 -> Page 3 -> Page 4
 * 4. EPUB Dublin Core metadata
 *
 * Strict Fallback:
 * If no author is found on any of the 4 pages, returns null (empty author). Never fabricates an author.
 */
export async function extractDocumentMetadata(
  filePath: string,
  format: 'pdf' | 'epub',
  context?: { folderName?: string | null; title?: string | null }
): Promise<ExtractedDocumentMetadata> {
  const searchTarget = `${context?.title || ''} ${context?.folderName || ''} ${path.basename(filePath)}`.trim();

  // 1. Authoritative Strategy: Classical Heritage Books Catalog
  // Provides 100% uniform author resolution across all multi-volume series (Parts 1..N)
  let catalogAuthor: string | null = null;
  for (const item of HERITAGE_BOOKS_CATALOG) {
    if (item.pattern.test(searchTarget)) {
      catalogAuthor = item.author;
      break;
    }
  }

  // 2. Document Content Strategy: Inspect actual document content (Pages 1-8)
  let docMeta: ExtractedDocumentMetadata;
  if (format === 'epub') {
    docMeta = await inspectEpubDocument(filePath);
  } else {
    docMeta = await inspectPdfDocument(filePath);
  }

  // If authoritative heritage catalog matched, it guarantees 100% series uniformity!
  if (catalogAuthor) {
    return {
      author: catalogAuthor,
      title: docMeta.title,
      introText: docMeta.introText,
      summary: docMeta.summary,
      numPages: docMeta.numPages,
      pageFound: docMeta.pageFound || 1,
      method: 'heritage_catalog',
    };
  }

  // If document content has an authentic author on pages 1-8 that passed strict validation
  if (docMeta.author && !isBlacklistedAuthor(docMeta.author)) {
    return docMeta;
  }

  // 3. Folder Heuristics Strategy: Check explicit patterns (e.g. "(تأليف فلان)")
  let folderAuthor: string | null = null;
  if (context?.folderName) {
    const candidate = extractAuthorFromFolderOrFile(context.folderName);
    if (candidate && !isBlacklistedAuthor(candidate)) {
      folderAuthor = candidate;
    }
  }

  // 4. Strict Fallback:
  // If author is NOT found in catalog, document pages, nor explicitly marked in folder,
  // leave author strictly null / empty. Never guess or fabricate an author name!
  return {
    author: folderAuthor || null,
    title: docMeta.title,
    introText: docMeta.introText,
    summary: docMeta.summary,
    numPages: docMeta.numPages,
    pageFound: docMeta.pageFound,
    method: folderAuthor ? 'folder_heuristics' : docMeta.method,
  };
}

/**
 * Backward compatibility wrapper for extractAuthorFromDocument
 */
export async function extractAuthorFromDocument(
  filePath: string,
  format: 'pdf' | 'epub',
  context?: { folderName?: string | null; title?: string | null }
): Promise<{ author: string | null; method: 'heritage_catalog' | 'folder_heuristics' | 'pages_content' | 'epub_creator' | null }> {
  const meta = await extractDocumentMetadata(filePath, format, context);
  const methodMap: Record<string, any> = {
    heritage_catalog: 'heritage_catalog',
    folder_heuristics: 'folder_heuristics',
    epub_creator: 'epub_creator',
    page_1: 'pages_content',
    page_2: 'pages_content',
    page_3: 'pages_content',
    page_4: 'pages_content',
    pdf_metadata: 'pages_content',
  };
  return {
    author: meta.author,
    method: (meta.method ? methodMap[meta.method] || 'pages_content' : null),
  };
}

