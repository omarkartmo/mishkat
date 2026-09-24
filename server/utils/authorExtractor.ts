import fs from 'fs';
import path from 'path';

// Known publisher / institutional / scanner blacklist
// Never treat an institutional, publisher, or scanner brand as an author name
const INSTITUTION_BLACKLIST = [
  'المكتبة', 'مكتبة', 'دار', 'وزارة', 'مركز', 'شبكة', 'موقع', 'منتدى',
  'منتديات', 'وقف', 'أوقاف', 'جامعة', 'مؤسسة', 'جمعية', 'لجنة', 'مطبعة',
  'مطابع', 'مطبوعات', 'تسجيلات', 'سلسلة', 'طبعة', 'الطبعة',
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

// -------------------------------------------------------------
// Authoritative Classical Heritage & Reference Catalog
// -------------------------------------------------------------
export const HERITAGE_BOOKS_CATALOG: Array<{ pattern: RegExp; author: string }> = [
  // Specific multi-volume or renowned classical works & studies
  { pattern: /إتحاف\s+الأعيان\s+في\s+تاريخ\s+بعض\s+علماء\s+عمان/i, author: 'الشيخ سيف بن حمود البطاشي' },
  { pattern: /إتحاف\s+الأئمة\s+بفقه\s+الإمامة(?:\s+في\s+الصلاة)?/i, author: 'الشيخ مسعود بن محمد المقبالي' },
  { pattern: /إتحاف\s+الأنام\s+بشرح\s+جوهر\s+النظام/i, author: 'مصطفى بن محمد شريفي' },
  { pattern: /ابتهالات\s+الشيخ\s+الهجاري/i, author: 'الشيخ ربيعة بن ماجد بن سليمان الكندي' },
  { pattern: /ابن\s+النضر(?:\s+لغز\s+يبحث\s+عن\s+حل)?/i, author: 'سلطان بن مبارك بن محمد الشيباني' },
  { pattern: /ابن\s+بور\s+في\s+الذاكرة\s+العمانية/i, author: 'سلطان بن مبارك بن محمد الشيباني' },
  { pattern: /ابن\s+ماجد\s+والبرتغال/i, author: 'الدكتور عبد الهادي التازي' },
  { pattern: /10\s+خطوات\s+للحج\s+المبرور|عشر\s+خطوات\s+للحج\s+المبرور/i, author: 'ماجد بن محمد بن سالم الكندي' },
  { pattern: /أبو\s+مسلم\s+الرواحي.*حسان\s+عمان/i, author: 'د. محمد بن صالح ناصر' },
  { pattern: /أبو\s+يعقوب\s+الوارجلاني\s+أصوليا/i, author: 'د. مصطفى بن صالح باجو' },
  { pattern: /أبو\s+العباس\s+أحمد\s+بن\s+سعيد\s+الشماخي\s+وآراؤه\s+الأصولية/i, author: 'عيسى مصباح (أبو عبد الحميد)' },
  { pattern: /أبو\s+بكر\s+بن\s+دريد\s+الأزدي.*أعلم\s+العلماء/i, author: 'د. هادي حسن حمودي' },
  { pattern: /أبو\s+بكر\s+بن\s+دريد|ابن\s+دريد(?:\s+الأزدي)?/i, author: 'ابن دريد الأزدي' },
  { pattern: /إباضية\s+جزيرة\s+جربة\s+خلال\s+العصر\s+الحديث/i, author: 'محمد المريمي' },

  // Foundational classical encyclopedias
  { pattern: /منهج\s+الطالبين(?:\s+وبلاغ\s+الراغبين)?/i, author: 'خميس بن سعيد الشقصي الرستاقي' },
  { pattern: /كتاب\s+الوضع/i, author: 'أبو زكريا يحيى بن أبي بكر الجناوني' },
  { pattern: /كتاب\s+الإيضاح/i, author: 'أبو ساكن عامر بن علي الشماخي' },
  { pattern: /بدء\s+الإسلام\s+وشرائع\s+الدين|ابن\s+سلام/i, author: 'ابن سلام الإباضي' },
  { pattern: /الجامع\s+الصغير/i, author: 'العلامة محمد بن يوسف إطفيش' },
  { pattern: /معالم\s+الفكر\s+التربوي\s+عند\s+الشيخ\s+أحمد/i, author: 'د. زايد بن سليمان الجهضمي' },
  { pattern: /قاموس\s+الشريعة/i, author: 'جميل بن خميس السعدي' },
  { pattern: /بيان\s+الشرع/i, author: 'محمد بن إبراهيم الكندي' },
  { pattern: /كتاب\s+المصنف/i, author: 'أبو بكر أحمد بن عبد الله الكندي' },
  { pattern: /الضياء/i, author: 'سلمة بن مسلم العوتبي' },
  { pattern: /الأنساب/i, author: 'سلمة بن مسلم العوتبي' },
  { pattern: /الإبانة\s+في\s+اللغة/i, author: 'سلمة بن مسلم العوتبي' },
  { pattern: /تحفة\s+الأعيان\s+بسيرة\s+أهل\s+عمان/i, author: 'عبد الله بن حميد السالمي' },
  { pattern: /(?<!شرح\s+|بشرح\s+)جوهر\s+النظام/i, author: 'عبد الله بن حميد السالمي' },
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

// Common Arabic Given Names & Nisbas
const ARABIC_NAME_TOKENS = new Set([
  'محمد', 'أحمد', 'احمد', 'محمود', 'علي', 'سالم', 'سعيد', 'خالد', 'عمر', 'عثمان',
  'يحيى', 'يحي', 'إبراهيم', 'ابراهيم', 'صالح', 'صلاح', 'يوسف', 'سليمان', 'حمد', 'سيف',
  'ناصر', 'ربيعة', 'ربيع', 'مصطفى', 'عمار', 'حسان', 'شيماء', 'سعاد', 'هلال', 'رضا',
  'مسعود', 'سلطان', 'خميس', 'قاسم', 'طالب', 'فرج', 'تيسير', 'مهنى', 'عيد', 'جمعة',
  'جميل', 'زايد', 'خلفان', 'راشد', 'حمود', 'سرحان', 'عبدالعزيز', 'عبدالرحمن', 'عبدالله',
  'عبدالرحيم', 'عبدالكريم', 'عبدالحميد', 'عبدالقادر', 'حوحو', 'الراشدي', 'الهنائي',
  'الهادي', 'الرواحي', 'اللمكي', 'الزيدية', 'الدغيشية', 'البوسعيدي', 'الجابري',
  'الشيباني', 'الكندي', 'المقبالي', 'البطاشي', 'الخليلي', 'الجهضمي', 'السالمي',
  'الشقصي', 'العوتبي', 'السعدي', 'الوارجلاني', 'الشماخي', 'باجو',
  'شريفي', 'أطفيش', 'إطفيش', 'النووي', 'البخاري', 'مسلم', 'عيسى', 'معمر', 'باديس',
  'القيرواني', 'دغيشي', 'زبيدي', 'المريمي', 'التازي', 'هادي', 'حمودي', 'مصباح'
]);

// Non-name words that disqualify or delimit an author candidate
const INVALID_NAME_WORDS = new Set([
  'ليس', 'لها', 'له', 'أن', 'ان', 'تسافر', 'محرم', 'يوجد', 'فلا', 'يجب', 'شكر',
  'تقدير', 'عرفان', 'العام', 'التخصص', 'المناقش', 'المشرف', 'الجامعي', 'الدراسي',
  'صفحة', 'باب', 'فصل', 'مقدمة', 'خاتمة', 'بحث', 'رسالة', 'أطروحة', 'مذكرة',
  'كلية', 'جامعة', 'قسم', 'شعبة', 'تاريخ', 'سنة', 'سلطنة', 'عمان', 'وزارة',
  'إشراف', 'اشراف', 'المشرف', 'مشرف', 'إعداد', 'اعداد', 'الطالب', 'الطالبة',
  'الباحث', 'الباحثة', 'الأستاذ', 'الاستاذ', 'الدكتور', 'دكتور', 'الشيخ', 'الرقم',
  'تخرج', 'استكمال', 'متطلبات', 'درجة', 'بكالوريوس', 'ماستر', 'ماجستير', 'دكتوراه',
  'الذي', 'التي', 'الذين', 'حيث', 'وقد', 'وذلك', 'إلى', 'على', 'في', 'من', 'عن',
  'جوز', 'امو', 'مل', 'دجوي', 'اهل', 'كسل', 'فسل', 'كثري', 'تعهد', 'إهداء', 'اهداء',
  'البريمي', 'ريحم'
]);

const WORD_CORRECTION_MAP: Record<string, string> = {
  'حممد': 'محمد',
  'أمحد': 'أحمد',
  'امحد': 'أحمد',
  'صاحل': 'صالح',
  'إمساعيل': 'إسماعيل',
  'احلريب': 'الحربي',
  'اهلادي': 'الهادي',
  'اهلنائي': 'الهنائي',
  'العماين': 'العماني',
  'الساملي': 'السالمي',
  'األغربي': 'الأغبري',
  'األؼبري': 'الأغبري',
  'إبراهم': 'إبراهيم',
  'تيسري': 'تيسير',
  'بني': 'بن',
  'هالل': 'هلال',
  'الراواحي': 'الرواحي',
  'مجعة': 'جمعة',
  'محدان': 'حمدان',
  'محد': 'محمد',
  'الشيباين': 'الشيباني',
  'مخيس': 'خميس',
  'مهين': 'مهنى',
  'حى': 'يحيى',
  'املشرف': 'المشرف',
  'املناقش': 'المناقش',
  'اجلامعي': 'الجامعي',
  'احلقوق': 'الحقوق',
  'حمفوظة': 'محفوظة',
  'تأليص': 'تأليف',
};

// Normalizes and heals Arabic font corruptions, OCR merged tokens, and ligatures
export function normalizeArabicNameString(text: string): string {
  if (!text) return '';
  let s = text
    .normalize('NFKC')
    .replace(/[\uF000-\uF8FF]/g, '') // Private Use characters / bullets like 
    .replace(/[•*#~`_•|()[\]]/g, ' ')
    .replace(/ٌ/g, 'ي')
    .replace(/األ/g, 'الأ')
    .replace(/سع\s+يد/g, 'سعيد')
    .replace(/العزي\s+ز/g, 'العزيز')
    .replace(/الر\s+حمن/g, 'الرحمن')
    .replace(/عبد\s*هللا/g, 'عبد الله')
    .replace(/عبدهللا/g, 'عبد الله')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // tashkeel
    .replace(/\s+/g, ' ')
    .trim();

  const words = s.split(' ');
  const replaced = words.map((w, idx) => {
    if (w === 'صالح' && words[idx + 1] === 'الدين') {
      return 'صلاح';
    }
    return WORD_CORRECTION_MAP[w] || w;
  });

  return replaced.join(' ').replace(/\s+/g, ' ').trim();
}

// Strict validator to ensure candidate string is authentic Arabic human name
export function isValidArabicPersonName(name: string): boolean {
  if (!name) return false;
  let cleaned = name.replace(/[.*:؛\-_/\\()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  cleaned = cleaned
    .replace(/^(?:د|أ)\s*[\/.]\s*/i, '')
    .replace(/^(?:(?:الشيخ|الدكتور|الأستاذ|الباحث|الباحثة|الطالب|الطالبة|العلامة|الإمام|الفقيه|القاضي)\s+)+/gi, '')
    .trim();
  const words = cleaned.split(' ').filter((w) => w.length > 0);

  if (words.length < 2 || words.length > 8) {
    const singleAllowed = /^(?:أطفيش|إطفيش|السالمي|الشقصي|الكندي|الجهضمي|العوتبي|النووي|البخاري|مسلم)$/.test(cleaned);
    if (!singleAllowed) return false;
  }

  for (const w of words) {
    if (INVALID_NAME_WORDS.has(w)) return false;
    if (!/^[\u0600-\u06FF]+$/.test(w)) return false;
    if (w.length < 2 && w !== 'و') return false;
  }

  let recognizedCount = 0;
  for (const w of words) {
    const bare = w.replace(/^(?:ال|و)/, '');
    if (
      ARABIC_NAME_TOKENS.has(w) ||
      ARABIC_NAME_TOKENS.has(bare) ||
      w === 'بن' || w === 'ابن' || w === 'بنت' || w === 'آل' || w === 'أبو' || w === 'أبي' ||
      w === 'عبد' || w === 'الله' || w === 'الدين'
    ) {
      recognizedCount++;
    }
  }

  return recognizedCount >= 1 && (recognizedCount / words.length) >= 0.25;
}

// Clean and normalize extracted author name
export function cleanAuthorName(name: string): string | null {
  if (!name) return null;

  let res = normalizeArabicNameString(name);

  // 1. Remove common role prefixes if attached at start
  res = res.replace(/^(?:تأليف|المؤلف|تصنيف|المصنف|إعداد\s+الطالبة|إعداد\s+الطالب|إعداد\s+الباحث|إعداد\s+الباحثة|إعداد|الطالب|الطالبة|الباحث|الباحثة|بقلم|جمع وتأليف|جمع وترتيب|صنعه|اف\s+الأستاذ(?:\s+إشر)?|إشراف\s+الأستاذ|إشراف|ناقشها\s+الأستاذ|ناقشها\s+الطالب|ناقشها\s+الباحث|ناقشها\s+الدكتور|ناقشها|الأستاذ\s+الدكتور)\s*[:/؛\-]?\s*/gi, '').trim();

  // 2. Normalize abbreviated academic prefixes: "د/" or "د /" -> "د. " and "أ/" or "أ /" -> "أ. "
  res = res.replace(/^(?:د|أ)\s*[\/.]\s*/i, (match) => {
    return match.toLowerCase().startsWith('د') ? 'د. ' : 'أ. ';
  });

  // Truncate at boundary words
  const boundaries = [
    'إشراف', 'اشراف', 'المشرف', 'املشرف', 'مشرف', 'اسم المشرف', 'اسم املشرف',
    'المناقش', 'املناقش', 'مناقش', 'اسم المناقش', 'اسم املناقش', 'لجنة المناقشة', 'رئيس اللجنة',
    'العام الجامعي', 'العام اجلامعي', 'العام الدراسي', 'السنة الجامعية', 'السنة الدراسية',
    'العام', 'السنة', 'الرقم الجامعي', 'الرقم اجلامعي', 'الرقم', 'التخصص', 'القسم', 'شعبة',
    'بكلية', 'كلية', 'بجامعة', 'جامعة', 'بالمعهد', 'المعهد', 'بالمدرسة', 'المدرسة',
    'بقسم', 'قسم', 'بشعبة', 'شعبة', 'في كلية', 'في جامعة', 'في قسم', 'في معهد',
    'الفصل الدراسي', 'تاريخ المناقشة', 'الذي', 'التي', 'الذين', 'حيث',
    'مقدم', 'ممدم', 'للدكتور', 'تحقيق', 'دراسة', 'طبعة', 'الطبعة', 'دار', 'مكتبة', 'مركز',
    'المجلد', 'الجزء', 'حقوق', 'جميع الحقوق', 'رقم الإيداع', 'ردمك', 'isbn',
    '20', '14', 'منذ', 'وهو', 'وهي'
  ];

  for (const b of boundaries) {
    const regex = new RegExp(`(?:^|\\s)${b}(?:\\s|$)`, 'i');
    const m = res.match(regex);
    if (m && m.index !== undefined && m.index > 2) {
      res = res.substring(0, m.index).trim();
    }
  }

  // Stop at trailing eulogies or honorific blessings
  const eulogies = [
    'رحمه الله تعالى', 'رحمه الله', 'رضي الله عنه', 'رضي الله عنهم',
    'حفظه الله تعالى', 'حفظه الله', 'عفا الله عنه', 'نفعنا الله به',
    'قدس سره', 'وفاته', 'توفي سنة', 'توفي عام'
  ];
  for (const eulogy of eulogies) {
    const idx = res.indexOf(eulogy);
    if (idx !== -1) {
      res = res.substring(0, idx).trim();
    }
  }

  // Strip numbers (student IDs, years) from name
  res = res.replace(/[\d\u0660-\u0669]+/g, ' ').replace(/\s+/g, ' ').trim();
  res = res.replace(/[:؛,،\-_/\\.]/g, ' ').replace(/\s+/g, ' ').trim();
  res = normalizeArabicNameString(res);

  if (isBlacklistedAuthor(res)) {
    return null;
  }

  // Specific scholar normalization
  if (/^محمد\s+بن\s+يوسف\s+(?:إطفيش|أطفيش|اطفيش)/i.test(res)) {
    return 'العلامة محمد بن يوسف إطفيش';
  }
  if (/^(?:د\s+)?محمد\s+(?:بن\s+)?صالح\s+ناصر/i.test(res)) {
    return 'د. محمد بن صالح ناصر';
  }

  if (isValidArabicPersonName(res)) {
    return res;
  }

  return null;
}

// Reverse characters in a string
export function reverseString(s: string): string {
  return s.split('').reverse().join('');
}

// Reverse each word's characters individually
export function reverseWords(s: string): string {
  return s.split(/\s+/).map((w) => reverseString(w)).join(' ');
}

/**
 * Extracts author from normalized text stream
 */
export function extractAuthorFromText(rawText: string): string | null {
  if (!rawText) return null;

  const cleanedText = normalizeArabicNameString(rawText);

  // 1. Direct scholar matches
  if (/محمد\s+بن\s+صالح\s+ناصر|محمد\s+صالح\s+ناصر/i.test(cleanedText)) {
    return 'د. محمد بن صالح ناصر';
  }

  // 2. Primary Academic Researcher / Student Patterns
  const studentPatterns = [
    /(?:إعداد\s+الطالبة|إعداد\s+الطالب|إعداد\s+الباحثة|إعداد\s+الباحث|اسم\s+الطالبة|اسم\s+الطالب|اسم\s+الباحثة|اسم\s+الباحث|الطالبة|الطالب|الباحثة|الباحث)\s*[:/؛\-]?\s*([^\n\r]+?)(?=(?:إشراف|المشرف|اسم\s+المشرف|المناقش|اسم\s+المناقش|العام|السنة|الرقم|التخصص|القسم|مقدم|ممدم|$))/i,
    /(?:مذكرة\s+مكملة\s+لنيل\s+شهادة\s+الماستر|بحث\s+تخرج|رسالة\s+ماجستير|أطروحة\s+دكتوراه)[\s\S]*?(?:إعداد\s+الطالبة|إعداد\s+الطالب|إعداد)\s*[:/؛\-]?\s*([^\n\r]+?)(?=(?:إشراف|المشرف|الرقم|العام|$))/i,
    /(?:إعداد)\s*[:/؛\-]?\s*([^\n\r]+?)(?=(?:إشراف|المشرف|الرقم|الرقم\s+الجامعي|العام|$))/i,
  ];

  for (const pat of studentPatterns) {
    const m = cleanedText.match(pat);
    if (m && m[1]) {
      const cand = cleanAuthorName(m[1]);
      if (cand) return cand;
    }
  }

  // 3. Classical Pattern: "تأليف / تصنيف / بقلم [اسم المؤلف]"
  const classicalPatterns = [
    /(?:تصنيف|تأليف|المصنف|المؤلف|بقلم|صنعه|أدعية\s+الشيخ)\s*[:/؛\-]?\s*([^\n\r]+?)(?=(?:تحقيق|دراسة|طبعة|دار|مكتبة|العام|$))/i,
    /(?:للعلامة|للشيخ\s+العلامة|للشيخ|للإمام|للدكتور)\s+([^\n\r]+?)(?=(?:تحقيق|طبعة|دار|$))/i
  ];

  for (const pat of classicalPatterns) {
    const m = cleanedText.match(pat);
    if (m && m[1]) {
      const cand = cleanAuthorName(m[1]);
      if (cand) return cand;
    }
  }

  // 4. Reverse title page layout: "[Author Name] : تأليف / تصنيف"
  const revHonPattern = /(?:^|[.\n\r،؛])\s*(?:.*?\s+)?((?:الشيخ|شيخ|الدكتور|دكتور|الأستاذ|أستاذ|الإمام|إمام|العلامة|علامة|القاضي)\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,5})\s*:\s*(?:تأليف|المؤلف|تصنيف|المصنف|إعداد|بقلم)/;
  const mRevHon = cleanedText.match(revHonPattern);
  if (mRevHon && mRevHon[1]) {
    const candidate = cleanAuthorName(mRevHon[1]);
    if (candidate) return candidate;
  }

  return null;
}

/**
 * Extracts author from distinct line items (handles multi-line title pages)
 */
export function extractAuthorFromLines(lines: string[]): string | null {
  if (!lines || lines.length === 0) return null;

  // 1. Primary Academic Researcher / Student Patterns: Check item-by-item first
  for (let i = 0; i < lines.length; i++) {
    const normItem = normalizeArabicNameString(lines[i]);
    if (/^(?:إعداد|إعداد\s+الطالب|إعداد\s+الطالبة|إعداد\s+الباحث|إعداد\s+الباحثة|اسم\s+الطالب|اسم\s+الباحث|الطالب|الباحث)\s*[:/؛\-]?$/i.test(normItem)) {
      const parts: string[] = [];
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const rawNext = lines[j];
        const normNext = normalizeArabicNameString(rawNext);
        if (/(?:الرقم|الرقم\s+الجامعي|اجلامعي|العام|السنة|التخصص|القسم)/i.test(normNext)) break;
        if (/(?:إشراف|المشرف|املشرف|مشرف)/i.test(normNext)) break;
        if (/^[\d\s\-_–—]+$/.test(rawNext)) break;
        if (/^[*#:؛.،•|]+$/.test(rawNext.trim())) continue;
        if (/(?:اف\s+الأستاذ|إشر)/i.test(normNext)) continue;

        parts.push(rawNext);
      }

      if (parts.length > 0) {
        // 1. Check if first part is a complete valid name (e.g. "ناصر ربيعة" before supervisor "رضا حوحو")
        const firstSingle = cleanAuthorName(parts[0]);
        if (
          firstSingle &&
          isValidArabicPersonName(firstSingle) &&
          firstSingle.split(' ').length >= 2 &&
          !firstSingle.endsWith('بن') &&
          !firstSingle.endsWith('بنت') &&
          !/(?:^|\s)(?:سع|العزي|الر)(?:\s|$)/.test(firstSingle)
        ) {
          return firstSingle;
        }

        // 2. Heal broken multi-part syllables (e.g. "سع" + "يد", "عمر بن عبد العزي" + "ز")
        const joined = parts.join(' ');
        const healedCand = cleanAuthorName(joined);
        if (healedCand && isValidArabicPersonName(healedCand) && !/(?:^|\s)(?:سع|العزي|الر)(?:\s|$)/.test(healedCand)) {
          return healedCand;
        }

        for (const p of parts) {
          const single = cleanAuthorName(p);
          if (single && isValidArabicPersonName(single) && single.split(' ').length >= 2) {
            return single;
          }
        }
      }
    }

    const inlineMatch = normItem.match(/^(?:إعداد\s+الطالب|إعداد\s+الطالبة|إعداد|اسم\s+الطالب|اسم\s+الباحث|الطالب|الباحث)\s*[:/؛\-]\s*(.+)$/i);
    if (inlineMatch && inlineMatch[1]) {
      const cand = cleanAuthorName(inlineMatch[1]);
      if (cand && isValidArabicPersonName(cand)) {
        return cand;
      }
    }
  }

  // 2. Classical Role Markers
  const roleMarkers = ['تأليف', 'المؤلف', 'تصنيف', 'المصنف', 'إعداد', 'بقلم', 'صنعه', 'جمع وترتيب', 'جمع وتأليف'];
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeArabicNameString(lines[i]);
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
        const inlineRemainder = line.replace(new RegExp(`^${marker}\\s*[:/؛\\-]?\\s*`), '').trim();
        if (inlineRemainder.length >= 3 && !isBlacklistedAuthor(inlineRemainder)) {
          const cleaned = cleanAuthorName(inlineRemainder);
          if (cleaned) return cleaned;
        }

        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const next = normalizeArabicNameString(lines[j]);
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

  const arabicLetters = clean.match(/[\u0600-\u06FF]/g) || [];
  const latinLetters = clean.match(/[a-zA-Z]/g) || [];
  const digits = clean.match(/[0-9\u0660-\u0669]/g) || [];
  const nonSpaceLength = clean.replace(/\s+/g, '').length;

  if (nonSpaceLength === 0) return false;
  if (arabicLetters.length / nonSpaceLength < 0.75) return false;
  if (latinLetters.length / nonSpaceLength > 0.10) return false;
  if (digits.length / nonSpaceLength > 0.15) return false;

  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 6) return false;

  const taaMarbutaStartCount = words.filter((w) => w.startsWith('ة')).length;
  if (taaMarbutaStartCount > 0) return false;

  const reversedAlCount = words.filter((w) => w.length >= 4 && w.endsWith('ال')).length;
  if (reversedAlCount >= 2) return false;

  const totalWordChars = words.reduce((acc, w) => acc + w.length, 0);
  const avgWordLen = totalWordChars / words.length;
  if (avgWordLen < 2.5 || avgWordLen > 9.0) return false;

  const singleLetters = words.filter((w) => w.length === 1 && w !== 'و').length;
  if (singleLetters / words.length > 0.15) return false;

  if (words.some((w) => /(.)\1\1/.test(w))) return false;
  if (words.some((w) => w.length > 14)) return false;

  let recognizedCount = 0;
  for (const w of words) {
    const bare = w.replace(/^(?:ال|و|ف|ب|ل|ك)/, '');
    if (COMMON_ARABIC_WORDS.has(w) || COMMON_ARABIC_WORDS.has(bare)) {
      recognizedCount++;
    }
  }

  return recognizedCount >= 2;
}

/**
 * High-Fidelity Synthesizer: Produces an eloquent academic summary
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
 */
export function extractIntroductionExcerpt(allText: string): { introExcerpt: string | null; introFull: string } {
  if (!allText) return { introExcerpt: null, introFull: '' };

  const normalized = normalizeArabicUnicode(allText);

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

  const authorInParen = name.match(/\((?:تأليف|المؤلف|تصنيف|المصنف|بقلم|إعداد|للشيخ|للإمام|للدكتور)\s*([^\)]+)\)/i);
  if (authorInParen && authorInParen[1]) {
    const cleaned = cleanAuthorName(authorInParen[1]);
    if (cleaned) return cleaned;
  }

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
  method: 'heritage_catalog' | 'folder_heuristics' | 'page_1' | 'page_2' | 'page_3' | 'page_4' | 'intro_signature' | 'epub_creator' | 'pdf_metadata' | null;
}

/**
 * Inspects a PDF document strictly page-by-page:
 * - Pages 1-3 for Title and Author
 * - Skips Dedications and Acknowledgments
 * - Prioritizes Academic Researcher / Student over Supervisor
 * - Checks introduction signature at pages 4-8 as fallback
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

    const maxTitlePages = Math.min(3, doc.numPages);

    // 1. Inspect Title Pages (Pages 1 through 3)
    for (let pageNum = 1; pageNum <= maxTitlePages; pageNum++) {
      try {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const rawItems = textContent.items
          .map((item: any) => item.str || '')
          .filter((s: string) => s.trim().length > 0);
        const pageStr = rawItems.join(' ').trim();

        if (pageStr.length > 0) {
          combinedPagesText += ` ${pageStr}`;

          // Check if page is dedication or acknowledgments: skip author extraction on such pages
          const isDedicationOrAck = /(?:الإهداء|اهداء|شكر\s+وتقدير|شكر\s+وعرفان)/i.test(pageStr) &&
            !/(?:كلية|جامعة|بحث\s+تخرج|مذكرة|دراسة\s+فقهية|تأليف|المؤلف)/i.test(pageStr);

          if (!author && !isDedicationOrAck) {
            let cand = extractAuthorFromLines(rawItems);
            if (!cand) {
              cand = extractAuthorFromText(pageStr);
            }

            // Check reversed text stream ONLY if reversed markers exist
            if (!cand && /(?:فينصت|ملقب|هقفلا|ةعبط|فيلأت|ريحم)/i.test(pageStr)) {
              cand = extractAuthorFromLines(rawItems.map((s: string) => reverseWords(s)));
              if (!cand) {
                cand = extractAuthorFromText(reverseWords(pageStr));
              }
            }

            if (cand && !isBlacklistedAuthor(cand) && isValidArabicPersonName(cand)) {
              author = cand;
              pageFound = pageNum;
              method = `page_${pageNum}` as any;
            }
          }

          if (!title && rawItems.length >= 2 && pageNum <= 3) {
            const candTitle = extractTitleFromPageText(pageStr, rawItems);
            if (candTitle && candTitle.split(' ').length >= 2 && !isInvalidBookTitle(candTitle)) {
              title = candTitle;
            }
          }
        }
      } catch {}
    }

    // 2. Comprehensive Introduction, Thesis Defense, and Preface Scanner (Pages 4 through 12)
    // Runs if author not found, or if author was found from uncertain/reversed text on pages 3-4
    if (!author || method === 'page_3' || method === 'page_4') {
      for (let pageNum = 4; pageNum <= Math.min(12, doc.numPages); pageNum++) {
        try {
          const page = await doc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const rawItems = textContent.items
            .map((item: any) => item.str || '')
            .filter((s: string) => s.trim().length > 0);
          const pageStr = rawItems.join(' ').trim();
          combinedPagesText += ` ${pageStr}`;

          const normalText = pageStr;
          const revText = reverseWords(pageStr);

          let foundIntroAuthor: string | null = null;

          for (const text of [normalText, revText]) {
            // Thesis defense / presentation declaration (e.g. "أطروحة الدكتوراه التي ناقشها الأستاذ محمد المريمي بكلية...")
            const thesisPat = /(?:أطروحة|رسالة)\s+(?:الدكتوراه|الماجستير)?\s*التي\s+(?:ناقشها|أعدها|قدمها)\s+(?:الأستاذ|الباحث|الطالب|الدكتور)?\s*([^\n،.,؛:]{3,50})/i;
            const mThesis = text.match(thesisPat);
            if (mThesis && mThesis[1]) {
              const cand = cleanAuthorName(mThesis[1]);
              if (cand && isValidArabicPersonName(cand)) {
                foundIntroAuthor = cand;
                break;
              }
            }

            // Preface author statement (e.g. "والمؤلف وهو ابن جزيرة جربة" or "والمؤلف هو فلان")
            const authorIntroPat = /(?:والمؤلف|المؤلف)\s+(?:وهو|هو)\s+([^\n،.,؛:]{3,40})/i;
            const mAuth = text.match(authorIntroPat);
            if (mAuth && mAuth[1]) {
              const cand = cleanAuthorName(mAuth[1]);
              if (cand && isValidArabicPersonName(cand)) {
                foundIntroAuthor = cand;
                break;
              }
            }

            // Introduction conclusion signature (e.g. "كتبه فلان ... كلية العلوم الشرعية")
            const sigMatch = text.match(/([^\n\r.،؛]{3,40}?)\s*(?:كلية\s+العلوم\s+الشرعية|جامعة\s+[\u0600-\u06FF]+|كلية\s+[\u0600-\u06FF]+)/i);
            if (sigMatch && sigMatch[1]) {
              const cand = cleanAuthorName(sigMatch[1]);
              if (cand && isValidArabicPersonName(cand)) {
                foundIntroAuthor = cand;
                break;
              }
            }

            // Classical treatise author introduction
            const classicalIntroPat = /(?:أما\s+بعد\s+فيقول|يقول\s+العبد\s+الفقير|قال\s+العبد\s+الضعيف|يقول\s+راجي\s+عفو\s+ربه)\s+([^\n،.,؛:]{3,40})/i;
            const mClass = text.match(classicalIntroPat);
            if (mClass && mClass[1]) {
              const cand = cleanAuthorName(mClass[1]);
              if (cand && isValidArabicPersonName(cand)) {
                foundIntroAuthor = cand;
                break;
              }
            }
          }

          if (foundIntroAuthor) {
            author = foundIntroAuthor;
            pageFound = pageNum;
            method = 'intro_signature';
            break;
          }
        } catch {}
      }
    }

    // 3. Fallback: Check PDF metadata info ONLY IF it is not blacklisted
    if (!author) {
      try {
        const meta = await doc.getMetadata();
        const metaAuthor = (meta.info as any)?.Author;
        if (metaAuthor && typeof metaAuthor === 'string') {
          const clean = cleanAuthorName(metaAuthor);
          if (clean && !isBlacklistedAuthor(clean) && isValidArabicPersonName(clean)) {
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
      numPages: numPages || null,
      pageFound: null,
      method: null,
    };
  }
}

/**
 * Extracts metadata from an EPUB document via Dublin Core metadata
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
 */
export async function extractDocumentMetadata(
  filePath: string,
  format: 'pdf' | 'epub',
  context?: { folderName?: string | null; title?: string | null }
): Promise<ExtractedDocumentMetadata> {
  const searchTarget = `${context?.title || ''} ${context?.folderName || ''} ${path.basename(filePath)}`.trim();

  // 1. Primary Strategy: Inspect actual document content (pages 1-4, title page, preface)
  let docMeta: ExtractedDocumentMetadata;
  if (format === 'epub') {
    docMeta = await inspectEpubDocument(filePath);
  } else {
    docMeta = await inspectPdfDocument(filePath);
  }

  if (docMeta.author && !isBlacklistedAuthor(docMeta.author)) {
    return docMeta;
  }

  // 2. Folder Heuristics Strategy: Check explicit patterns (e.g. "(تأليف فلان)")
  let folderAuthor: string | null = null;
  if (context?.folderName) {
    const candidate = extractAuthorFromFolderOrFile(context.folderName);
    if (candidate && !isBlacklistedAuthor(candidate)) {
      folderAuthor = candidate;
    }
  }

  if (folderAuthor) {
    return {
      author: folderAuthor,
      title: docMeta.title,
      introText: docMeta.introText,
      summary: docMeta.summary,
      numPages: docMeta.numPages,
      pageFound: docMeta.pageFound,
      method: 'folder_heuristics',
    };
  }

  // 3. Fallback Strategy: Classical Heritage Catalog if document content has no author text
  let catalogAuthor: string | null = null;
  for (const item of HERITAGE_BOOKS_CATALOG) {
    if (item.pattern.test(searchTarget)) {
      catalogAuthor = item.author;
      break;
    }
  }

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

  return {
    author: null,
    title: docMeta.title,
    introText: docMeta.introText,
    summary: docMeta.summary,
    numPages: docMeta.numPages,
    pageFound: docMeta.pageFound,
    method: docMeta.method,
  };
}

/**
 * Backward compatibility wrapper
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
    intro_signature: 'pages_content',
    pdf_metadata: 'pages_content',
  };
  return {
    author: meta.author,
    method: meta.method ? methodMap[meta.method] || 'pages_content' : null,
  };
}
