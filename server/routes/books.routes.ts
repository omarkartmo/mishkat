import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../db/pool';
import { serverConfig } from '../config';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';
import { extractAuthorFromDocument, extractDocumentMetadata, isValidArabicSentence, normalizeArabicForSearch, stripDiacritics, synthesizeBookSummary } from '../utils/authorExtractor';

const router = Router();

// Ensure staging directory exists
const stagingDir = path.join(serverConfig.dirs.temp, 'staging');
if (!fs.existsSync(stagingDir)) {
  fs.mkdirSync(stagingDir, { recursive: true });
}

// Multer storage engine for single uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'cover') {
      cb(null, serverConfig.dirs.covers);
    } else {
      cb(null, serverConfig.dirs.digital);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `book-${Date.now()}-${Math.random().toString(36).substr(2, 6)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: serverConfig.maxFileSizeMB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.pdf', '.epub', '.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يُسمح فقط بملفات PDF و EPUB والصور.'));
    }
  },
});

// Multer storage engine for Bulk Staging (Section 20 Requirement)
const stagingStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, stagingDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `stage-${Date.now()}-${Math.random().toString(36).substr(2, 6)}${ext}`;
    cb(null, safeName);
  },
});

const uploadStaging = multer({
  storage: stagingStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB per file
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.epub'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('الاستيراد الجماعي يقبل فقط ملفات الكتب الرقمية بصيغتي PDF و EPUB.'));
    }
  },
});

function isWithinDirectory(targetPath: string, parentDir: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedParent = path.resolve(parentDir);
  const relative = path.relative(resolvedParent.toLowerCase(), resolvedTarget.toLowerCase());
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

// Helper to resolve digital storage directories and configured root URL (Section 19)
async function getDigitalStorageContext(): Promise<{
  allowedDirs: string[];
  customRoot: string | null;
  defaultDir: string;
  hasCustomRoot: boolean;
}> {
  const defaultDir = path.resolve(serverConfig.dirs.digital);
  const allowedDirs: string[] = [
    defaultDir,
    path.resolve(serverConfig.dirs.books),
    path.resolve(stagingDir),
  ];

  let customRoot: string | null = null;
  try {
    const { rows } = await db.query("SELECT value FROM system_settings WHERE key = 'library_config' LIMIT 1");
    if (rows.length > 0) {
      const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      if (val?.digitalBookRootUrl && typeof val.digitalBookRootUrl === 'string' && val.digitalBookRootUrl.trim()) {
        const trimmed = val.digitalBookRootUrl.trim();
        const rootPath = path.isAbsolute(trimmed)
          ? trimmed
          : path.join(process.cwd(), trimmed);
        customRoot = path.resolve(rootPath);
        allowedDirs.push(customRoot);
      }
      if (Array.isArray(val?.allowedRoots)) {
        for (const r of val.allowedRoots) {
          if (typeof r === 'string' && r.trim()) {
            const resolvedRoot = path.resolve(r.trim());
            if (!allowedDirs.some((d) => d.toLowerCase() === resolvedRoot.toLowerCase())) {
              allowedDirs.push(resolvedRoot);
            }
          }
        }
      }
    }
  } catch {}

  const hasCustomRoot = !!(customRoot && path.normalize(customRoot).toLowerCase() !== path.normalize(defaultDir).toLowerCase());

  return { allowedDirs, customRoot, defaultDir, hasCustomRoot };
}

// Helper to extract clean Title & Author from filename patterns (Section 23 Requirement)
function extractTitleAndAuthor(filename: string): { title: string; author: string } {
  const rawBase = path.basename(filename, path.extname(filename)).trim();

  // Pattern: "العنوان - المؤلف"
  if (rawBase.includes(' - ')) {
    const parts = rawBase.split(' - ');
    const title = parts[0].replace(/_/g, ' ').trim();
    const author = parts.slice(1).join(' - ').replace(/_/g, ' ').trim();
    return { title: title || 'بدون عنوان', author: author || 'مؤلف غير محدد' };
  }
  if (rawBase.includes(' للشيخ ')) {
    const parts = rawBase.split(' للشيخ ');
    return { title: parts[0].replace(/[_-]/g, ' ').trim(), author: `الشيخ ${parts[1].replace(/[_-]/g, ' ').trim()}` };
  }
  if (rawBase.includes(' تأليف ')) {
    const parts = rawBase.split(' تأليف ');
    return { title: parts[0].replace(/[_-]/g, ' ').trim(), author: parts[1].replace(/[_-]/g, ' ').trim() };
  }
  if (rawBase.includes(' تحقيق ')) {
    const parts = rawBase.split(' تحقيق ');
    return { title: parts[0].replace(/[_-]/g, ' ').trim(), author: `تحقيق ${parts[1].replace(/[_-]/g, ' ').trim()}` };
  }

  const base = rawBase
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { title: base, author: 'مؤلف غير محدد' };
}

// Helper to strip volume/part designations to obtain the canonical base title of a book series
export function getBaseBookTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/\s*[-–]\s*(?:الجزء|المجلد|قسم|ج)\s*.*$/i, '')
    .replace(/\s+(?:ج(?:زء)?|المجلد|الجزء|قسم)\s*(?:\d+|الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[٠-٩]+).*$/i, '')
    .replace(/\s+\d+$/, '')
    .trim();
}

// Generic folder names to ignore when extracting titles
const GENERIC_FOLDER_NAMES = new Set([
  'pdf', 'epub', 'digital', 'books', 'ebooks', 'files', 'temp', 'tmp',
  'downloads', 'new folder', 'مجلد جديد', 'كتب', 'ملفات', 'تحميل', 'المكتبة'
]);

// Helper to detect if a file name is random, generic, numeric, or hash-like
function isRandomOrGenericFileName(baseName: string): boolean {
  const clean = baseName.trim();
  if (!clean) return true;

  // 1. Pure numbers/digits (e.g. "12345", "987654321")
  if (/^\d+$/.test(clean)) return true;

  // 2. Hexadecimal hash (e.g. MD5, SHA, 8+ hex chars: "a94f29bc", "4f8a3c9b21")
  if (/^[0-9a-fA-F]{8,}$/.test(clean)) return true;

  // 3. UUID / GUID (e.g. "c9bf9e57-1685-4c89-bafb-ff5af830be8a")
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(clean)) return true;

  // 4. Common generic filenames
  const genericNames = [
    'book', 'document', 'file', 'download', 'output', 'scan', 'content', 'main', 'text',
    'ebook', 'pdf', 'epub', 'final', 'print', 'temp', 'untitled', 'doc', 'sample', 'preview',
    'كتاب', 'ملف', 'مستند', 'تحميل', 'نسخة', 'بدون عنوان', 'مطبوع'
  ];
  if (genericNames.includes(clean.toLowerCase())) return true;

  // 5. Generic prefixes with numbers (e.g. "book_1", "doc-12", "file_001", "scan_1")
  if (/^(book|doc|file|scan|download|temp|ebook|output|كتاب|ملف|مستند)[_-]?\d+$/i.test(clean)) return true;

  // 6. Random alphanumeric string without spaces or Arabic characters
  if (/^[a-zA-Z0-9_-]{1,24}$/.test(clean) && !/[\u0600-\u06FF]/.test(clean)) {
    const hasDigits = /\d/.test(clean);
    const hasLetters = /[a-zA-Z]/.test(clean);
    // Mixed letters and digits (e.g. "f83b2a9e", "k92m10", "doc12a")
    if (hasDigits && hasLetters) return true;
    // Very short without spaces (<= 4 chars)
    if (clean.length <= 4) return true;
  }

  return false;
}

// Helper to check whether a book in a subfolder should adopt its parent folder name as title
function shouldAdoptFolderNameAsTitle(
  filePath: string,
  rootDir: string
): { adopt: boolean; folderName: string | null } {
  const parentDir = path.dirname(filePath);
  const resolvedParent = path.resolve(parentDir);
  const resolvedRoot = path.resolve(rootDir);

  // If file is not in a subfolder beneath root, do not adopt
  if (resolvedParent === resolvedRoot || !resolvedParent.startsWith(resolvedRoot)) {
    return { adopt: false, folderName: null };
  }

  const folderName = path.basename(parentDir).trim();
  if (!folderName || GENERIC_FOLDER_NAMES.has(folderName.toLowerCase())) {
    return { adopt: false, folderName: null };
  }

  // Count how many digital book files are in this parent folder
  let booksInFolder = 0;
  try {
    const entries = fs.readdirSync(parentDir);
    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (['.pdf', '.epub'].includes(ext)) {
        booksInFolder++;
      }
    }
  } catch {
    return { adopt: false, folderName: null };
  }

  // Only adopt if the folder is dedicated to this book (has exactly 1 digital book)
  if (booksInFolder !== 1) {
    return { adopt: false, folderName: null };
  }

  const fileName = path.basename(filePath);
  const baseName = path.basename(fileName, path.extname(fileName));

  // Condition 1: File name is recognized as random or generic
  if (isRandomOrGenericFileName(baseName)) {
    return { adopt: true, folderName };
  }

  // Condition 2: Folder name has Arabic characters while filename does not
  const folderHasArabic = /[\u0600-\u06FF]/.test(folderName);
  const fileHasArabic = /[\u0600-\u06FF]/.test(baseName);
  if (folderHasArabic && !fileHasArabic) {
    return { adopt: true, folderName };
  }

  // Condition 3: Folder name has explicit title/author separators (e.g. " - ", " للشيخ ", " تأليف ")
  if (folderName.includes(' - ') || folderName.includes(' للشيخ ') || folderName.includes(' تأليف ') || folderName.includes(' تحقيق ')) {
    return { adopt: true, folderName };
  }

  // Condition 4: Folder name has spaces (multiple words) while filename is a single token
  if (folderName.includes(' ') && !baseName.includes(' ') && !baseName.includes('_') && !baseName.includes('-')) {
    return { adopt: true, folderName };
  }

  return { adopt: false, folderName: null };
}

// Automatic Classification Algorithm using MISHKAT Category Model
// Enhanced multi-zone weighting (Title: 5x, Author: 3x, Introduction & Summary: 2x, Filename: 1x)
export function classifyBook(
  title: string,
  author: string,
  filename: string,
  categories: any[],
  introText?: string | null
): { categoryId: string; categoryName: string; confidence: number } {
  const normTitle = normalizeArabicForSearch(title || '');
  const normAuthor = normalizeArabicForSearch(author || '');
  const normFilename = normalizeArabicForSearch(filename || '');
  const normIntro = normalizeArabicForSearch(introText || '');

  const rules: {
    catId: string;
    name: string;
    keywords: string[];
  }[] = [
    {
      catId: 'cat-islamic',
      name: 'العلوم الشرعية والفكر الإسلامي',
      keywords: [
        'فقه', 'عقيده', 'شريعه', 'حديث', 'تفسير', 'قران', 'اباضي', 'اباضيه', 'اصول الفقه', 'اصول الدين',
        'توحيد', 'صلاه', 'زكاه', 'صوم', 'حج', 'طهاره', 'عبادات', 'معاملات', 'احكام', 'فتاوى', 'قضاء',
        'فرائض', 'مواريث', 'اجماع', 'قياس', 'سنن', 'مسند', 'موطا', 'صحيح', 'مصطلح الحديث', 'علوم القران',
        'تجويد', 'قراءات', 'فقه مقارن', 'سلف', 'تيميه', 'اطفيش', 'اتفيش', 'جيطالي', 'سالمي', 'كندي', 'عوتبي',
        'ثميني', 'ورجلاني', 'وارجلاني', 'ربيع بن حبيب', 'ابن سلام', 'شماخي', 'جناويني', 'جناوني', 'الجامع الصغير',
        'الجامع الكبير', 'بيان الشرع', 'المصنف', 'الضياء', 'قاموس الشريعه', 'النيل', 'منهج الطالبين', 'بلاغ الراغبين',
        'الراغبين', 'الشقصي', 'الرستاقي', 'قواعد الاسلام', 'قناطر الخيرات', 'معارج الامال', 'جوهر النظام', 'تلقين الصبيان',
        'بهجه الانوار', 'مدارج الكمال', 'الاديان', 'الايضاح', 'الوضع', 'هميان الزاد', 'تيسير التفسير', 'رياض الصالحين',
        'الاربعون النوويه', 'نووي', 'استقامه'
      ],
    },
    {
      catId: 'cat-arabic',
      name: 'اللغة العربية وآدابها',
      keywords: [
        'نحو', 'اعراب', 'بلاغه', 'معجم', 'معاجم', 'الفيه', 'لسان', 'سيبويه', 'جرجاني', 'شعر', 'ديوان',
        'قصائد', 'قصيده', 'اشعار', 'ابيات', 'قوافي', 'عروض', 'لغه', 'صرف', 'فصاحه', 'بيان', 'بديع',
        'معاني', 'مفردات', 'نحاه', 'ابن مالك', 'اجروميه', 'املاء', 'لسانيات', 'ادب عربي', 'ادب', 'ادبي',
        'نقد ادبي', 'نثر', 'مقامه', 'مقامات', 'روايه', 'قصه', 'حكايه', 'مسرحيه', 'نصوص ادبيه', 'حسان عمان',
        'حسان', 'رواحي', 'ابو مسلم', 'شوقي', 'حافظ', 'متنبي', 'معري', 'جاحظ', 'ابن جني', 'زمخشري', 'كشاف',
        'خليل بن احمد', 'فراهيدي', 'ابن دريد', 'جمهره', 'لسان العرب', 'تاج العروس', 'اساس البلاغه', 'قطر الندى',
        'شذور الذهب', 'الكتاب لسيبويه', 'ديوان شعر', 'قصص'
      ],
    },
    {
      catId: 'cat-history',
      name: 'التاريخ والحضارة والآثار',
      keywords: [
        'تاريخ', 'حضاره', 'حضارات', 'عمان', 'اندلس', 'طبري', 'سيره', 'سيره نبويه', 'سير', 'فتوح', 'معركه',
        'غزوات', 'معارك', 'دوله', 'خلافه', 'يعاربه', 'نباهنه', 'بوسعيدي', 'اعيان', 'تراجم', 'وفيات', 'انساب',
        'سلاطين', 'ملوك', 'ائمه', 'وقائع', 'رحلات', 'ابن بطوطه', 'مسالك', 'ممالك', 'وثائق', 'جغرافيا تاريخيه',
        'اثار', 'قلاع', 'حصون', 'عصر', 'عهد', 'تحفه الاعيان', 'كشف الغمه', 'سير الائمه', 'انساب العرب',
        'فتوح البلدان', 'الكامل في التاريخ', 'البدايه والنهايه', 'مروج الذهب', 'مقدمه ابن خلدون', 'ابن خلدون'
      ],
    },
    {
      catId: 'cat-science',
      name: 'العلوم الطبيعية والتكنولوجيا',
      keywords: [
        'علوم', 'فيزياء', 'كيمياء', 'احياء', 'فلك', 'طب', 'طبيعه', 'كون', 'بيئه', 'هندسه', 'تقنيه',
        'حاسوب', 'برمجه', 'ذكاء اصطناعي', 'رياضيات', 'جبر', 'حساب', 'فلكي', 'طبيه', 'صيدله', 'ادويه',
        'تشريح', 'كواكب', 'نجوم', 'شبكات', 'برمجيات', 'الكترونيات', 'طاقه', 'جيولوجيا', 'نبات', 'حيوان',
        'تجارب', 'معادلات', 'مختبر', 'ذره', 'جينات', 'وراثه', 'معلوماتيه', 'امن سيبراني'
      ],
    },
    {
      catId: 'cat-education',
      name: 'التربية ومناهج البحث العلمي',
      keywords: [
        'تربيه', 'تربوي', 'تعليم', 'تدريس', 'مناهج التعليم', 'مناهج التدريس', 'مناهج البحث', 'بحث علمي',
        'مدرسه', 'مدارس', 'معلمين', 'معلم', 'طرق التدريس', 'علم النفس التربوي', 'ارشاد تربوي', 'تحصيل دراسي',
        'تقويم تربوي', 'بيداغوجيا', 'اطروحه', 'رساله ماجستير', 'دكتوراه', 'كفايات', 'تدريب تربوي',
        'بيئه تعليميه', 'اشراف تربوي', 'اداره مدرسيه', 'تعلم نشط', 'استراتيجيات التدريس', 'معالم الفكر التربوي'
      ],
    },
    {
      catId: 'cat-general',
      name: 'الثقافة العامة والتطوير الذاتي',
      keywords: [
        'تطوير الذات', 'تنميه بشريه', 'اداره الوقت', 'نجاح', 'قياده', 'مهارات', 'فكر', 'ثقافه عامه',
        'موسوعه', 'وعي', 'مجتمع', 'تواصل', 'علاقات', 'عادات', 'تحفيز', 'انتاجيه', 'ذكاء عاطفي', 'تفكير نقدي'
      ],
    },
  ];

  let bestCatId = categories[0]?.id || 'cat-general';
  let bestCatName = categories[0]?.name || 'عام';
  let bestScore = 0;

  for (const rule of rules) {
    let score = 0;
    for (const kw of rule.keywords) {
      const normalizedKw = normalizeArabicForSearch(kw);
      if (!normalizedKw) continue;

      // 1. Title Zone: Highest weight (5x)
      if (normTitle.includes(normalizedKw)) {
        score += 50;
      }
      // 2. Author Zone: Strong weight (3x)
      if (normAuthor.includes(normalizedKw)) {
        score += 30;
      }
      // 3. Intro / Preface / Summary Zone: Content weight (2x)
      if (normIntro.includes(normalizedKw)) {
        score += 20;
      }
      // 4. Filename Zone: Basic weight (1x)
      if (normFilename.includes(normalizedKw)) {
        score += 10;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      const matched = categories.find(
        (c) => c.id === rule.catId || c.name === rule.name || c.name.includes(rule.name) || rule.name.includes(c.name)
      );
      if (matched) {
        bestCatId = matched.id;
        bestCatName = matched.name;
      } else {
        bestCatName = rule.name;
        bestCatId = rule.catId;
      }
    }
  }

  const confidence = bestScore > 0 ? Math.min(100, Math.max(50, Math.round(bestScore * 1.2))) : 30;
  return { categoryId: bestCatId, categoryName: bestCatName, confidence };
}

// Helper to resolve digital book file path safely across local, digital dirs and configured root URL (Section 17 & 19 Requirement)
async function resolveDigitalBookFilePath(book: any): Promise<string | null> {
  const { allowedDirs, customRoot, defaultDir, hasCustomRoot } = await getDigitalStorageContext();

  const rawNames: string[] = [];
  if (book.file_path) {
    rawNames.push(path.basename(book.file_path));
  }
  if (book.file_url) {
    const bname = path.basename(book.file_url);
    try {
      rawNames.push(decodeURIComponent(bname));
    } catch {}
    rawNames.push(bname);
  }
  if (book.title && book.format) {
    rawNames.push(`${book.title.trim()}.${book.format.trim()}`);
  }
  if (book.id && book.format) {
    rawNames.push(`${book.id}.${book.format.trim()}`);
  }
  const fileNames = Array.from(new Set(rawNames.filter(Boolean)));

  // Case 1: An authoritative custom root directory is configured by the admin (Section 19)
  // When a custom directory is active, books must be retrieved from that directory.
  // We do NOT silently fall back to the old default folder if a file does not exist in the custom root.
  if (hasCustomRoot && customRoot) {
    // 1. Check direct candidates inside the custom root
    for (const fname of fileNames) {
      const cand = path.join(customRoot, fname);
      if (fs.existsSync(cand) && isWithinDirectory(cand, customRoot)) {
        return path.resolve(cand);
      }
    }

    // 2. If book.file_path is an absolute path explicitly within the custom root
    if (book.file_path && path.isAbsolute(book.file_path)) {
      const resolved = path.resolve(book.file_path);
      if (fs.existsSync(resolved) && isWithinDirectory(resolved, customRoot)) {
        return resolved;
      }
    }

    // 3. Staging directory for newly uploaded/staged books awaiting finalize
    if (book.file_path && isWithinDirectory(book.file_path, stagingDir) && fs.existsSync(book.file_path)) {
      return path.resolve(book.file_path);
    }

    // File was not found in the configured custom repository
    return null;
  }

  // Case 2: Standard default storage (LibraryData/books/digital)
  const candidates: string[] = [];

  if (book.file_path) {
    if (path.isAbsolute(book.file_path)) {
      candidates.push(book.file_path);
    } else {
      candidates.push(path.join(defaultDir, path.basename(book.file_path)));
      candidates.push(path.join(defaultDir, book.file_path));
    }
  }

  for (const fname of fileNames) {
    candidates.push(path.join(defaultDir, fname));
    candidates.push(path.join(serverConfig.dirs.books, fname));
    candidates.push(path.join(stagingDir, fname));
  }

  for (const cand of candidates) {
    const resolved = path.resolve(cand);
    if (fs.existsSync(resolved)) {
      const isAllowed = allowedDirs.some((dir) => isWithinDirectory(resolved, dir));
      if (isAllowed) {
        return resolved;
      } else {
        return '__FORBIDDEN_PATH__';
      }
    }
  }

  return null;
}

// GET /api/v1/books
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { type, categoryId, search } = req.query;
    let sql = 'SELECT * FROM books WHERE 1=1';
    const params: any[] = [];

    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    if (categoryId && categoryId !== 'all') {
      params.push(categoryId);
      sql += ` AND category_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (title ILIKE $${params.length} OR author ILIKE $${params.length} OR summary ILIKE $${params.length})`;
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await db.query(sql, params);

    const formatted = rows.map((b) => {
      if (b.type === 'physical') {
        return {
          id: b.id,
          type: 'physical',
          title: b.title,
          author: b.author,
          publisher: b.publisher,
          publishYear: b.publish_year,
          isbn: b.isbn,
          categoryId: b.category_id,
          language: b.language,
          summary: b.summary,
          pages: b.pages_count,
          tags: b.tags || [],
          coverImage: b.cover_image,
          totalCopies: b.total_copies,
          availableCopies: b.available_copies,
          location: {
            cabinet: b.cabinet || '',
            shelf: b.shelf || '',
            section: b.section || '',
          },
          addedAt: b.created_at,
        };
      } else {
        return {
          id: b.id,
          type: 'digital',
          title: b.title,
          author: b.author,
          categoryId: b.category_id,
          format: b.format,
          fileSizeMb: parseFloat((b.file_size || '1').replace(/[^\d.]/g, '')) || 1,
          fileSize: b.file_size,
          pages: b.pages_count,
          pagesCount: b.pages_count,
          summary: b.summary,
          coverImage: b.cover_image,
          sourceOrigin: b.source_origin,
          filePath: b.file_path,
          fileUrl: b.file_url,
          fileHash: b.file_hash,
          tags: b.tags || [],
          downloadCount: b.download_count || 0,
          readCount: b.read_count || 0,
          tableOfContents: b.table_of_contents,
          sampleContent: b.sample_content,
          addedAt: b.created_at,
          isbn: b.isbn,
          language: b.language,
        };
      }
    });

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// GET /api/v1/books/:id
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query('SELECT * FROM books WHERE id = $1 LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الكتاب غير موجود.' } });
    }
    const b = rows[0];
    res.json({ success: true, data: b });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/books/bulk-stage (Bulk Upload & Staging with Automatic Extraction & Classification - Section 20-24)
router.post('/bulk-stage', authenticateToken, requireRole('admin', 'librarian'), uploadStaging.array('files', 200), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILES', message: 'لم يتم استلام أي ملفات للفرز والاستيراد.' } });
    }

    const { rows: categories } = await db.query('SELECT id, name FROM categories ORDER BY name ASC');

    // Optional relativePaths passed when uploading entire folders via webkitdirectory
    let relativePathsMap: Record<string, string> = {};
    if (req.body.relativePaths) {
      try {
        relativePathsMap = typeof req.body.relativePaths === 'string'
          ? JSON.parse(req.body.relativePaths)
          : req.body.relativePaths;
      } catch {}
    }

    const stagedResults: any[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '') as 'pdf' | 'epub';
      const stagedFilePath = file.path;

      // Calculate SHA-256
      const buffer = fs.readFileSync(stagedFilePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const sizeMb = Number((file.size / (1024 * 1024)).toFixed(2));

      // Check if relative path was provided (e.g. from folder upload) and has a meaningful parent folder
      const relPath = relativePathsMap[file.originalname] || relativePathsMap[String(i)] || '';
      let adoptFolder = false;
      let folderName: string | null = null;

      if (relPath) {
        const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
        if (parts.length > 1) {
          const candidateFolder = parts[parts.length - 2].trim();
          if (candidateFolder && !GENERIC_FOLDER_NAMES.has(candidateFolder.toLowerCase())) {
            const baseName = path.basename(file.originalname, path.extname(file.originalname));
            if (
              isRandomOrGenericFileName(baseName) ||
              (/[\u0600-\u06FF]/.test(candidateFolder) && !/[\u0600-\u06FF]/.test(baseName)) ||
              candidateFolder.includes(' - ') ||
              candidateFolder.includes(' للشيخ ') ||
              candidateFolder.includes(' تأليف ') ||
              (candidateFolder.includes(' ') && !baseName.includes(' '))
            ) {
              adoptFolder = true;
              folderName = candidateFolder;
            }
          }
        }
      }

      // Extract title & author from folder name if adopted, otherwise from file name
      const sourceName = adoptFolder && folderName ? folderName : file.originalname;
      let { title, author } = extractTitleAndAuthor(sourceName);
      let authorDetectedFrom: 'folder' | 'file' | 'document' = adoptFolder && author !== 'مؤلف غير محدد' ? 'folder' : author !== 'مؤلف غير محدد' ? 'file' : 'file';

      let docSummary: string | null = null;
      let docIntroText: string | null = null;
      let docNumPages: number | null = null;

      try {
        const docMeta = await extractDocumentMetadata(stagedFilePath, ext, { folderName, title });
        if (docMeta.title && isRandomOrGenericFileName(title)) {
          title = docMeta.title;
        }
        if (docMeta.author && (!author || author === 'مؤلف غير محدد')) {
          author = docMeta.author;
          authorDetectedFrom = 'document';
        } else if (author === 'مؤلف غير محدد') {
          // Strict user rule: if no authentic author is verified across pages 1-4, leave empty
          author = '';
        }
        docIntroText = docMeta.introText;
        docSummary = docMeta.summary;
        docNumPages = docMeta.numPages || null;
      } catch {
        if (author === 'مؤلف غير محدد') {
          author = '';
        }
      }

      // Automatic classification (Section 24) with Intro Text analysis
      const { categoryId, categoryName, confidence } = classifyBook(title, author, sourceName, categories, docIntroText);

      // Duplicate detection (Section 26)
      const { rows: dupHashRows } = await db.query('SELECT id, title FROM books WHERE file_hash = $1 LIMIT 1', [hash]);
      const isDuplicate = dupHashRows.length > 0;
      const duplicateReason = isDuplicate ? `الكتاب موجود مسبقاً بنفس البصمة (${dupHashRows[0].title})` : null;

      const status = isDuplicate ? 'duplicate' : confidence < 40 ? 'needs_review' : 'ready';

      stagedResults.push({
        tempId: path.basename(file.filename, path.extname(file.filename)),
        originalFileName: file.originalname,
        folderName: folderName || null,
        detectedFrom: adoptFolder ? 'folder' : 'file',
        authorDetectedFrom,
        stagedFilePath,
        format: ext,
        fileSizeMb: sizeMb,
        fileHash: hash,
        title,
        author,
        categoryId,
        categoryName,
        confidence,
        status,
        isDuplicate,
        duplicateReason,
        pages: docNumPages || Math.max(1, Math.round(sizeMb * 45)),
        summary: (docSummary && isValidArabicSentence(docSummary)) ? docSummary : synthesizeBookSummary(title, author, categoryName),
      });
    }

    // Multi-Volume Series Harmonization:
    // Harmonize author and category across all parts of multi-volume series
    const stagedSeriesMap = new Map<string, { author: string; authorDetectedFrom: any; categoryId: string; categoryName: string; confidence: number }>();
    for (const item of stagedResults) {
      const baseTitle = getBaseBookTitle(item.title);
      if (baseTitle && item.author && item.author.trim().length > 0) {
        if (!stagedSeriesMap.has(baseTitle) || item.authorDetectedFrom === 'document') {
          stagedSeriesMap.set(baseTitle, {
            author: item.author,
            authorDetectedFrom: item.authorDetectedFrom,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            confidence: item.confidence,
          });
        }
      }
    }
    for (const item of stagedResults) {
      const baseTitle = getBaseBookTitle(item.title);
      if (baseTitle && stagedSeriesMap.has(baseTitle)) {
        const canonical = stagedSeriesMap.get(baseTitle)!;
        if (!item.author || item.author !== canonical.author) {
          item.author = canonical.author;
          item.authorDetectedFrom = canonical.authorDetectedFrom;
          item.categoryId = canonical.categoryId;
          item.categoryName = canonical.categoryName;
          item.confidence = Math.max(item.confidence, canonical.confidence);
          item.status = item.isDuplicate ? 'duplicate' : item.confidence < 40 ? 'needs_review' : 'ready';
        }
      }
    }

    res.json({
      success: true,
      data: {
        totalDiscovered: files.length,
        staged: stagedResults,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'STAGE_FAILED', message: err.message } });
  }
});

// POST /api/v1/books/bulk-scan (Scan directory configured in digitalBookRootUrl - Section 19 & 20)
router.post('/bulk-scan', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { folderPath, limit, offset = 0, excludeImported = true } = req.body;

  try {
    // Resolve scan directory from input or system settings (Section 19)
    let targetDir = folderPath;
    if (!targetDir || !targetDir.trim()) {
      const { rows } = await db.query("SELECT value FROM system_settings WHERE key = 'library_config' LIMIT 1");
      if (rows.length > 0) {
        const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
        if (val?.digitalBookRootUrl) {
          targetDir = val.digitalBookRootUrl;
        }
      }
    }

    if (!targetDir) {
      targetDir = serverConfig.dirs.digital;
    }

    const resolvedDir = path.isAbsolute(targetDir) ? targetDir : path.join(process.cwd(), targetDir);

    if (!fs.existsSync(resolvedDir)) {
      return res.status(404).json({
        success: false,
        error: { code: 'DIRECTORY_NOT_FOUND', message: `مجلد الكتب الرقمية غير موجود في المسار: ${resolvedDir}` },
      });
    }

    // Authorize scanned directory in system_settings.allowedRoots for in-place streaming
    try {
      const { rows: cfgRows } = await db.query("SELECT value FROM system_settings WHERE key = 'library_config' LIMIT 1");
      let cfg: any = {};
      if (cfgRows.length > 0) {
        cfg = typeof cfgRows[0].value === 'string' ? JSON.parse(cfgRows[0].value) : cfgRows[0].value;
      }
      const roots: string[] = Array.isArray(cfg.allowedRoots) ? cfg.allowedRoots : [];
      if (!roots.some((r) => r.toLowerCase() === resolvedDir.toLowerCase())) {
        roots.push(resolvedDir);
        cfg.allowedRoots = roots;
        await db.query(`
          INSERT INTO system_settings (key, value) VALUES ('library_config', $1)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `, [JSON.stringify(cfg)]);
      }
    } catch {}

    const { rows: categories } = await db.query('SELECT id, name FROM categories ORDER BY name ASC');

    // Query existing digital books in DB to exclude already imported ones
    const { rows: existingRows } = await db.query(
      "SELECT file_hash, file_path FROM books WHERE type = 'digital'"
    );
    const existingHashes = new Set(existingRows.map((r) => r.file_hash).filter(Boolean));
    const existingPaths = new Set(existingRows.map((r) => r.file_path ? path.resolve(r.file_path) : null).filter(Boolean));

    const discoveredFiles: string[] = [];
    const scanRecursively = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanRecursively(full);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.pdf', '.epub'].includes(ext)) {
            discoveredFiles.push(full);
          }
        }
      }
    };

    scanRecursively(resolvedDir);

    let alreadyImportedCount = 0;
    const pendingFiles: string[] = [];

    for (const filePath of discoveredFiles) {
      const resolvedFilePath = path.resolve(filePath);
      let isImported = existingPaths.has(resolvedFilePath);

      // Check by file hash if path does not match
      if (!isImported) {
        try {
          const buffer = fs.readFileSync(filePath);
          const hash = crypto.createHash('sha256').update(buffer).digest('hex');
          if (existingHashes.has(hash)) {
            isImported = true;
          }
        } catch {}
      }

      if (isImported) {
        alreadyImportedCount++;
        if (excludeImported === false) {
          pendingFiles.push(filePath);
        }
      } else {
        pendingFiles.push(filePath);
      }
    }

    const totalDiscoveredInFolder = discoveredFiles.length;
    const totalPendingCount = pendingFiles.length;

    // Apply batch limit if requested (e.g. 25, 50, 100, or 'all')
    const numericLimit = limit && Number(limit) > 0 ? Number(limit) : 0;
    const startIndex = Math.max(0, Number(offset) || 0);
    const batchFiles = numericLimit > 0
      ? pendingFiles.slice(startIndex, startIndex + numericLimit)
      : pendingFiles.slice(startIndex);

    const hasMore = numericLimit > 0 && (startIndex + batchFiles.length < totalPendingCount);
    const remainingCount = Math.max(0, totalPendingCount - (startIndex + batchFiles.length));

    const scannedResults: any[] = [];
    for (const filePath of batchFiles) {
      const fileName = path.basename(filePath);
      const ext = path.extname(fileName).toLowerCase().replace('.', '') as 'pdf' | 'epub';
      const stat = fs.statSync(filePath);
      const sizeMb = Number((stat.size / (1024 * 1024)).toFixed(2));

      // Calculate SHA-256
      const buffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      // Check whether to adopt parent folder name as title/author
      const { adopt: adoptFolder, folderName } = shouldAdoptFolderNameAsTitle(filePath, resolvedDir);
      const sourceNameForMeta = adoptFolder && folderName ? folderName : fileName;

      let { title, author } = extractTitleAndAuthor(sourceNameForMeta);
      let authorDetectedFrom: 'folder' | 'file' | 'document' = adoptFolder && author !== 'مؤلف غير محدد' ? 'folder' : author !== 'مؤلف غير محدد' ? 'file' : 'file';

      let docSummary: string | null = null;
      let docIntroText: string | null = null;
      let docNumPages: number | null = null;

      try {
        const docMeta = await extractDocumentMetadata(filePath, ext, { folderName, title });
        if (docMeta.title && isRandomOrGenericFileName(title)) {
          title = docMeta.title;
        }
        if (docMeta.author && (!author || author === 'مؤلف غير محدد')) {
          author = docMeta.author;
          authorDetectedFrom = 'document';
        } else if (author === 'مؤلف غير محدد') {
          // Strict user rule: if no authentic author is verified across pages 1-4, leave empty
          author = '';
        }
        docIntroText = docMeta.introText;
        docSummary = docMeta.summary;
        docNumPages = docMeta.numPages || null;
      } catch {
        if (author === 'مؤلف غير محدد') {
          author = '';
        }
      }

      const { categoryId, categoryName, confidence } = classifyBook(title, author, sourceNameForMeta, categories, docIntroText);

      const isDuplicate = existingHashes.has(hash);

      scannedResults.push({
        tempId: `scan-${hash.substring(0, 8)}`,
        originalFileName: fileName,
        folderName: folderName || null,
        detectedFrom: adoptFolder ? 'folder' : 'file',
        authorDetectedFrom,
        stagedFilePath: filePath,
        format: ext,
        fileSizeMb: sizeMb,
        fileHash: hash,
        title,
        author,
        categoryId,
        categoryName,
        confidence,
        status: isDuplicate ? 'duplicate' : confidence < 40 ? 'needs_review' : 'ready',
        isDuplicate,
        duplicateReason: isDuplicate ? 'الكتاب مستورد مسبقاً في المستودع الرقمي المركزي' : null,
        pages: docNumPages || Math.max(1, Math.round(sizeMb * 45)),
        summary: (docSummary && isValidArabicSentence(docSummary)) ? docSummary : synthesizeBookSummary(title, author, categoryName),
      });
    }

    // Multi-Volume Series Harmonization:
    // When multiple parts of the same book are scanned (e.g. "منهج الطالبين وبلاغ الراغبين ج 4" .. "ج 9"):
    // 1. Group by base title (stripping volume / part indicators)
    // 2. Harmonize author and category across all parts if any part or catalog has verified metadata
    const scannedSeriesMap = new Map<string, { author: string; authorDetectedFrom: any; categoryId: string; categoryName: string; confidence: number }>();
    for (const item of scannedResults) {
      const baseTitle = getBaseBookTitle(item.title);
      if (baseTitle && item.author && item.author.trim().length > 0) {
        if (!scannedSeriesMap.has(baseTitle) || item.authorDetectedFrom === 'document') {
          scannedSeriesMap.set(baseTitle, {
            author: item.author,
            authorDetectedFrom: item.authorDetectedFrom,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            confidence: item.confidence,
          });
        }
      }
    }
    for (const item of scannedResults) {
      const baseTitle = getBaseBookTitle(item.title);
      if (baseTitle && scannedSeriesMap.has(baseTitle)) {
        const canonical = scannedSeriesMap.get(baseTitle)!;
        if (!item.author || item.author !== canonical.author) {
          item.author = canonical.author;
          item.authorDetectedFrom = canonical.authorDetectedFrom;
          item.categoryId = canonical.categoryId;
          item.categoryName = canonical.categoryName;
          item.confidence = Math.max(item.confidence, canonical.confidence);
          item.status = item.isDuplicate ? 'duplicate' : item.confidence < 40 ? 'needs_review' : 'ready';
        }
      }
    }

    res.json({
      success: true,
      data: {
        rootScanned: resolvedDir,
        totalDiscovered: scannedResults.length,
        totalDiscoveredInFolder,
        alreadyImportedCount,
        pendingCount: totalPendingCount,
        batchSize: scannedResults.length,
        hasMore,
        remainingCount,
        items: scannedResults,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SCAN_FAILED', message: err.message } });
  }
});

// POST /api/v1/books/bulk-import (Safe Batch Processing, Idempotent, Real Storage & DB Records - Section 20, 21, 26, 27)
router.post('/bulk-import', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'NO_ITEMS', message: 'مصفوفة الكتب للاستيراد مطلوبة.' } });
  }

  try {
    const { allowedDirs, customRoot, defaultDir, hasCustomRoot } = await getDigitalStorageContext();
    const destinationDir = (hasCustomRoot && customRoot) ? customRoot : defaultDir;

    let importedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const details: any[] = [];

    // Process safely in batches of 25 to avoid lock timeout (Section 21)
    const BATCH_SIZE = 25;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      await db.transaction(async (client) => {
        for (const item of batch) {
          const {
            stagedFilePath,
            title,
            author,
            categoryId,
            format = 'pdf',
            fileSizeMb = 1.0,
            summary = '',
            pages = 100,
            fileHash,
          } = item;

          if (!title || !title.trim()) {
            failedCount++;
            details.push({ title: title || 'بدون عنوان', status: 'failed', reason: 'عنوان الكتاب مفقود' });
            continue;
          }

          // Verify file physically exists (Section 27: A DB record without a real file is NOT valid)
          if (!stagedFilePath || !fs.existsSync(stagedFilePath)) {
            failedCount++;
            details.push({ title, status: 'failed', reason: 'ملف الكتاب الرقمي غير موجود على القرص' });
            continue;
          }

          // Calculate/verify SHA-256
          const buffer = fs.readFileSync(stagedFilePath);
          const computedHash = fileHash || crypto.createHash('sha256').update(buffer).digest('hex');

          // Check duplicate SHA-256 (Section 26: Duplicate Prevention)
          const { rows: dupHashRows } = await client.query('SELECT id, title FROM books WHERE file_hash = $1 LIMIT 1', [computedHash]);
          if (dupHashRows.length > 0) {
            skippedCount++;
            details.push({ title, status: 'skipped', reason: `موجود مسبقاً بنفس البصمة (${dupHashRows[0].id})` });
            continue;
          }

          // Check duplicate Title + Author
          const { rows: dupTitleRows } = await client.query(
            'SELECT id FROM books WHERE title = $1 AND author = $2 LIMIT 1',
            [title.trim(), (author || 'مؤلف غير محدد').trim()]
          );
          if (dupTitleRows.length > 0) {
            skippedCount++;
            details.push({ title, status: 'skipped', reason: 'موجود مسبقاً بنفس العنوان والمؤلف' });
            continue;
          }

          // Move or copy file to permanent digital storage directory (Section 20 & 27)
          const bookId = `dig-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          let finalFilePath: string;

          // Check whether the file was uploaded into temporary staging
          // vs an existing file residing on the server's filesystem (e.g. C:\Users\NABTAKIR\Downloads\كتب)
          const isUploadedToStaging = stagedFilePath.includes(stagingDir);

          if (isUploadedToStaging) {
            // Browser-uploaded temporary file: move it to permanent destinationDir
            const finalFileName = `${bookId}.${format}`;
            finalFilePath = path.join(destinationDir, finalFileName);
            try {
              fs.renameSync(stagedFilePath, finalFilePath);
            } catch {
              fs.copyFileSync(stagedFilePath, finalFilePath);
              try { fs.unlinkSync(stagedFilePath); } catch {}
            }
          } else {
            // Zero-Copy In-Place: The file is already permanently located on the server disk!
            // Link directly to the existing file without duplicating or renaming it.
            finalFilePath = path.resolve(stagedFilePath);
          }

          const finalFileUrl = `/api/v1/books/${bookId}/file`;
          const finalFileSizeStr = `${fileSizeMb.toFixed(1)} MB`;

          // Insert canonical book record
          await client.query(`
            INSERT INTO books (
              id, type, title, author, category_id, format, file_size, file_path, file_url, file_hash,
              pages_count, summary, source_origin, uploaded_by, tags, download_count, read_count
            ) VALUES ($1, 'digital', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'استيراد محلي جماعي (Bulk)', $12, ARRAY['استيراد جماعي', $13], 0, 0)
          `, [
            bookId,
            title.trim(),
            (author || 'مؤلف غير محدد').trim(),
            categoryId || 'cat-general',
            format,
            finalFileSizeStr,
            finalFilePath,
            finalFileUrl,
            computedHash,
            Number(pages) || 100,
            summary || `كتاب رقمي مستورد جماعياً: ${title.trim()}`,
            req.user!.id,
            format.toUpperCase(),
          ]);

          importedCount++;
          details.push({ id: bookId, title, status: 'imported', filePath: finalFilePath });
        }
      });
    }

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'BULK_IMPORT', 'books', 'bulk', { importedCount, skippedCount, failedCount }, req);

    res.status(201).json({
      success: true,
      data: {
        total: items.length,
        imported: importedCount,
        skipped: skippedCount,
        failed: failedCount,
        details,
        message: `تم استيراد ${importedCount} كتاب بنجاح، وتخطي ${skippedCount} كتاب مكرر، وفشل ${failedCount}.`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'BULK_IMPORT_FAILED', message: err.message } });
  }
});

// POST /api/v1/books (Admin single add book)
router.post('/', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const book = req.body;
  const isPhysical = book.type === 'physical' || !book.format;

  try {
    const id = book.id || `${isPhysical ? 'phys' : 'dig'}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    if (!isPhysical) {
      // Digital Book - verify physical file exists
      if (book.filePath && !fs.existsSync(book.filePath)) {
        return res.status(400).json({
          success: false,
          error: { code: 'FILE_NOT_FOUND', message: 'ملف الكتاب الرقمي غير موجود على مساحة التخزين المركزية.' }
        });
      }

      // Check for duplicates before publishing
      if (book.fileHash) {
        const { rows: dupRows } = await db.query(
          'SELECT id, title, author FROM books WHERE file_hash = $1 LIMIT 1',
          [book.fileHash]
        );
        if (dupRows.length > 0) {
          // Delete orphan uploaded file
          if (book.filePath && fs.existsSync(book.filePath) && path.basename(book.filePath).startsWith('dig-upload-')) {
            try { fs.unlinkSync(book.filePath); } catch {}
          }
          return res.status(409).json({
            success: false,
            error: {
              code: 'UPLOAD_DUPLICATE',
              message: `هذا الكتاب موجود مسبقاً بعنوان "${dupRows[0].title}".`,
              data: { existingBookId: dupRows[0].id }
            }
          });
        }
      }
    }

    await db.transaction(async (client) => {
      if (isPhysical) {
        await client.query(`
          INSERT INTO books (
            id, type, title, author, publisher, publish_year, isbn, category_id,
            language, summary, pages_count, tags, cover_image,
            total_copies, available_copies, cabinet, shelf, section
          ) VALUES ($1, 'physical', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          id,
          book.title,
          book.author,
          book.publisher || null,
          book.publishYear || null,
          book.isbn || null,
          book.categoryId || 'cat-general',
          book.language || 'العربية',
          book.summary || '',
          book.pages || 0,
          book.tags || [],
          book.coverImage || null,
          book.totalCopies || 1,
          book.availableCopies || book.totalCopies || 1,
          book.location?.cabinet || '',
          book.location?.shelf || '',
          book.location?.section || '',
        ]);

        // Create inventory copies
        const totalCopies = book.totalCopies || 1;
        for (let i = 1; i <= totalCopies; i++) {
          const copyId = `copy-${id}-${i}`;
          const barcode = `BC-${id.toUpperCase()}-${String(i).padStart(2, '0')}`;
          await client.query(`
            INSERT INTO physical_copies (id, book_id, barcode, copy_number, cabinet, shelf, section, status, condition)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', 'good')
          `, [
            copyId,
            id,
            barcode,
            i,
            book.location?.cabinet || '',
            book.location?.shelf || '',
            book.location?.section || '',
          ]);
        }
      } else {
        await client.query(`
          INSERT INTO books (
            id, type, title, author, category_id, format, file_size, file_url, file_path, file_hash,
            pages_count, summary, cover_image, source_origin, uploaded_by, tags,
            download_count, read_count, table_of_contents, sample_content
          ) VALUES ($1, 'digital', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 0, 0, $16, $17)
        `, [
          id,
          book.title,
          book.author,
          book.categoryId || 'cat-general',
          book.format || 'pdf',
          book.fileSize || '1.5 MB',
          book.fileUrl || `/api/v1/books/${id}/file`,
          book.filePath || null,
          book.fileHash || null,
          Number(book.pagesCount || book.pages || 0),
          book.summary || synthesizeBookSummary(book.title, book.author, ''),
          book.coverImage || null,
          book.sourceOrigin || null,
          req.user!.id,
          book.tags || [],
          JSON.stringify(book.tableOfContents || []),
          JSON.stringify(book.sampleContent || []),
        ]);
      }
    });

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'CREATE_BOOK', 'book', id, { title: book.title }, req);

    res.status(201).json({ success: true, data: { id, ...book } });
  } catch (err: any) {
    // Rollback orphan file on failure
    if (book.filePath && fs.existsSync(book.filePath) && path.basename(book.filePath).startsWith('dig-upload-')) {
      try { fs.unlinkSync(book.filePath); } catch {}
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/books/bulk-physical (Admin bulk import physical books via CSV/JSON payload)
router.post('/bulk-physical', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'NO_ITEMS', message: 'لم يتم توفير أي كتب ورقية للاستيراد.' }
    });
  }

  try {
    const { rows: categories } = await db.query('SELECT id, name FROM categories');
    const importedBooks: any[] = [];

    await db.transaction(async (client) => {
      for (const item of items) {
        if (!item.title || typeof item.title !== 'string' || !item.title.trim()) {
          continue; // Skip items with no title
        }

        const title = item.title.trim();
        const author = (item.author && typeof item.author === 'string') ? item.author.trim() : 'مؤلف غير محدد';
        const id = `phys-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        // Match category
        let categoryId = 'cat-general';
        if (item.categoryId) {
          const matched = categories.find((c) => c.id === item.categoryId);
          if (matched) categoryId = matched.id;
        }
        if (categoryId === 'cat-general' && item.categoryName) {
          const normalizedCat = normalizeArabicForSearch(item.categoryName);
          const matched = categories.find((c) => normalizeArabicForSearch(c.name).includes(normalizedCat) || normalizedCat.includes(normalizeArabicForSearch(c.name)));
          if (matched) categoryId = matched.id;
        }

        const totalCopies = Math.max(1, parseInt(item.totalCopies, 10) || 1);
        const pagesCount = Math.max(0, parseInt(item.pagesCount || item.pages, 10) || 0);
        const publishYear = parseInt(item.publishYear || item.year, 10) || null;
        const cabinet = item.cabinet || item.location?.cabinet || '';
        const shelf = item.shelf || item.location?.shelf || '';
        const section = item.section || item.location?.section || '';
        const language = item.language || 'العربية';
        const summary = item.summary || '';
        const publisher = item.publisher || null;
        const isbn = item.isbn || null;

        await client.query(`
          INSERT INTO books (
            id, type, title, author, publisher, publish_year, isbn, category_id,
            language, summary, pages_count, tags, cover_image,
            total_copies, available_copies, cabinet, shelf, section
          ) VALUES ($1, 'physical', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          id,
          title,
          author,
          publisher,
          publishYear,
          isbn,
          categoryId,
          language,
          summary,
          pagesCount,
          item.tags || [],
          item.coverImage || null,
          totalCopies,
          totalCopies,
          cabinet,
          shelf,
          section,
        ]);

        // Create inventory physical copies
        for (let i = 1; i <= totalCopies; i++) {
          const copyId = `copy-${id}-${i}`;
          const barcode = `BC-${id.toUpperCase()}-${String(i).padStart(2, '0')}`;
          await client.query(`
            INSERT INTO physical_copies (id, book_id, barcode, copy_number, cabinet, shelf, section, status, condition)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', 'good')
          `, [
            copyId,
            id,
            barcode,
            i,
            cabinet,
            shelf,
            section,
          ]);
        }

        importedBooks.push({
          id,
          type: 'physical',
          title,
          author,
          categoryId,
          totalCopies,
          availableCopies: totalCopies,
          publisher,
          publishYear,
          isbn,
          location: { cabinet, shelf, section },
          pages: pagesCount,
          summary,
        });
      }
    });

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'BULK_IMPORT_PHYSICAL_BOOKS',
      'books',
      'bulk',
      { count: importedBooks.length },
      req
    );

    res.status(201).json({
      success: true,
      data: {
        count: importedBooks.length,
        imported: importedBooks.length,
        message: `تم استيراد ${importedBooks.length} كتاب ورقي بنجاح.`,
        books: importedBooks,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PUT /api/v1/books/:id
router.put('/:id', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const book = req.body;
  const isPhysical = book.type === 'physical';

  try {
    if (isPhysical) {
      await db.query(`
        UPDATE books SET
          title = $1, author = $2, publisher = $3, publish_year = $4, isbn = $5,
          category_id = $6, language = $7, summary = $8, pages_count = $9, tags = $10,
          cover_image = $11, cabinet = $12, shelf = $13, section = $14
        WHERE id = $15
      `, [
        book.title,
        book.author,
        book.publisher || null,
        book.publishYear || null,
        book.isbn || null,
        book.categoryId,
        book.language,
        book.summary,
        book.pages || 0,
        book.tags || [],
        book.coverImage || null,
        book.location?.cabinet || '',
        book.location?.shelf || '',
        book.location?.section || '',
        id,
      ]);
    } else {
      await db.query(`
        UPDATE books SET
          title = $1, author = $2, category_id = $3, format = $4, file_size = $5,
          pages_count = $6, summary = $7, tags = $8, cover_image = $9, source_origin = $10
        WHERE id = $11
      `, [
        book.title,
        book.author,
        book.categoryId,
        book.format,
        book.fileSize,
        book.pagesCount || book.pages || 0,
        book.summary,
        book.tags || [],
        book.coverImage || null,
        book.sourceOrigin || null,
        id,
      ]);
    }

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'UPDATE_BOOK', 'book', id, { title: book.title }, req);

    res.json({ success: true, data: { message: 'تم تحديث بيانات الكتاب في الخادم المركزي بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});



// POST /api/v1/books/upload (Multer Single Upload with strict validation & duplicate safety)
router.post('/upload', authenticateToken, requireRole('admin', 'librarian'), (req: Request, res: Response, next: NextFunction) => {
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }])(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            error: { code: 'UPLOAD_FILE_TOO_LARGE', message: 'حجم الملف يتجاوز الحد الأقصى المسموح به.' }
          });
        }
        return res.status(400).json({
          success: false,
          error: { code: 'UPLOAD_MULTIPART_INVALID', message: `خطأ في استقبال الملف: ${err.message}` }
        });
      }
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_INVALID_FILE', message: err.message || 'نوع الملف غير مدعوم.' }
      });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const uploadedFile = files && files['file'] ? files['file'][0] : null;
    const uploadedCover = files && files['cover'] ? files['cover'][0] : null;

    if (!uploadedFile) {
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_MISSING_FILE', message: 'لم يتم اختيار أي ملف للرفع. يرجى اختيار ملف PDF أو EPUB.' }
      });
    }

    // Verify format
    const ext = path.extname(uploadedFile.originalname).toLowerCase().replace('.', '');
    if (!['pdf', 'epub'].includes(ext)) {
      if (fs.existsSync(uploadedFile.path)) {
        try { fs.unlinkSync(uploadedFile.path); } catch {}
      }
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_UNSUPPORTED_FORMAT', message: 'صيغة الملف غير مدعومة. يُسمح فقط بملفات PDF و EPUB.' }
      });
    }

    // Verify file exists on disk and is non-empty
    if (!fs.existsSync(uploadedFile.path) || fs.statSync(uploadedFile.path).size === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_EMPTY_FILE', message: 'الملف المرفوع فارغ أو تعذر حفظه على الخادم.' }
      });
    }

    // Compute SHA-256 of uploaded digital file for integrity and duplicate detection
    const buffer = fs.readFileSync(uploadedFile.path);
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Duplicate Check: check if identical digital book already exists in catalog
    const { rows: existing } = await db.query(
      'SELECT id, title, author FROM books WHERE file_hash = $1 LIMIT 1',
      [fileHash]
    );

    if (existing.length > 0) {
      // Clean up uploaded temp file to prevent orphan storage
      if (fs.existsSync(uploadedFile.path)) {
        try { fs.unlinkSync(uploadedFile.path); } catch {}
      }
      if (uploadedCover && fs.existsSync(uploadedCover.path)) {
        try { fs.unlinkSync(uploadedCover.path); } catch {}
      }

      return res.status(409).json({
        success: false,
        error: {
          code: 'UPLOAD_DUPLICATE',
          message: `هذا الكتاب موجود مسبقاً في المكتبة الرقمية بعنوان: "${existing[0].title}" للمؤلف ${existing[0].author}.`,
          data: {
            existingBookId: existing[0].id,
            title: existing[0].title,
            author: existing[0].author,
          },
        },
      });
    }

    // Generate a stable canonical book ID and move to canonical digital storage
    const uploadBookId = `dig-upload-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const canonicalName = `${uploadBookId}.${ext}`;
    const canonicalPath = path.join(serverConfig.dirs.digital, canonicalName);

    fs.renameSync(uploadedFile.path, canonicalPath);

    // Physically verify file was stored at canonical location
    if (!fs.existsSync(canonicalPath)) {
      return res.status(500).json({
        success: false,
        error: { code: 'UPLOAD_STORAGE_UNAVAILABLE', message: 'تعذر تأكيد حفظ الملف في مستودع التخزين المركزي.' }
      });
    }

    let detectedMeta: any = null;
    try {
      detectedMeta = await extractDocumentMetadata(canonicalPath, ext as 'pdf' | 'epub');
    } catch {}

    res.status(201).json({
      success: true,
      data: {
        bookId: uploadBookId,
        fileUrl: `/api/v1/books/${uploadBookId}/file`,
        filePath: canonicalPath,
        coverUrl: uploadedCover ? `/api/v1/books/files/covers/${uploadedCover.filename}` : null,
        coverPath: uploadedCover ? uploadedCover.path : null,
        fileSize: `${(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB`,
        fileSizeMb: Number((uploadedFile.size / (1024 * 1024)).toFixed(2)),
        originalName: uploadedFile.originalname,
        fileHash,
        sha256: fileHash,
        format: ext,
        detectedTitle: detectedMeta?.title || null,
        detectedAuthor: detectedMeta?.author || '',
        detectedSummary: detectedMeta?.summary || null,
        detectedPages: detectedMeta?.numPages || null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'UPLOAD_FAILED', message: err.message } });
  }
});

// GET /api/v1/books/files/covers/:filename
router.get('/files/covers/:filename', optionalAuth, (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.filename);
  const targetPath = path.join(serverConfig.dirs.covers, safeFilename);

  if (!isWithinDirectory(targetPath, serverConfig.dirs.covers) || !fs.existsSync(targetPath)) {
    return res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'صورة الغلاف غير موجودة.' } });
  }

  res.sendFile(path.resolve(targetPath));
});

// GET /api/v1/books/files/digital/:filename
router.get('/files/digital/:filename', authenticateToken, async (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.filename);
  const { allowedDirs, customRoot, defaultDir, hasCustomRoot } = await getDigitalStorageContext();

  let targetPath = path.join(defaultDir, safeFilename);
  if (hasCustomRoot && customRoot) {
    targetPath = path.join(customRoot, safeFilename);
  }

  const isAllowed = allowedDirs.some((dir) => isWithinDirectory(targetPath, dir));
  if (!isAllowed || !fs.existsSync(targetPath)) {
    return res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'الملف الرقمي غير موجود في المستودع المحدد.' } });
  }

  const isViewer =
    req.query.viewer === 'true' ||
    req.headers['x-mishkat-viewer'] === 'true' ||
    req.headers['x-requested-with'] === 'XMLHttpRequest';

  if (isViewer) {
    const stat = fs.statSync(targetPath);
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    });
    return fs.createReadStream(targetPath).pipe(res);
  }

  res.sendFile(path.resolve(targetPath));
});

// Stream Digital Book Handler (Supports both GET and POST /:id/stream)
// POST streaming completely eliminates browser download extension (IDM) interception.
async function streamDigitalBook(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const { rows } = await db.query('SELECT * FROM books WHERE id = $1 LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'سجل الكتاب غير موجود.' } });
    }

    const book = rows[0];
    const resolvedPath = await resolveDigitalBookFilePath(book);

    if (resolvedPath === '__FORBIDDEN_PATH__') {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'مسار الملف غير مصرح به خارج مستودع الكتب الرقمية.' } });
    }

    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'تعذر العثور على ملف الكتاب الرقمي على الخادم المركزي.',
        },
      });
    }

    // Path traversal check: verify path is within allowed digital storage directories
    const { allowedDirs } = await getDigitalStorageContext();
    const isAllowedPath = allowedDirs.some((dir) => isWithinDirectory(resolvedPath, dir));
    if (!isAllowedPath) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'مسار الملف غير مصرح به.' } });
    }

    const stat = fs.statSync(resolvedPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const isViewer =
      req.method === 'POST' ||
      req.query.viewer === 'true' ||
      req.headers['x-mishkat-viewer'] === 'true' ||
      req.headers['x-requested-with'] === 'XMLHttpRequest';

    // When requested by the integrated reader, serve as binary stream without attachment filename
    // to prevent browser extensions like Internet Download Manager (IDM) from hijacking the in-app document stream.
    const contentType = isViewer
      ? 'application/octet-stream'
      : (book.format || 'pdf').toLowerCase() === 'epub'
      ? 'application/epub+zip'
      : 'application/pdf';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(resolvedPath, { start, end });

      const responseHeaders: Record<string, string | number> = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      };

      if (!isViewer) {
        responseHeaders['Content-Disposition'] = `inline; filename="${encodeURIComponent(book.title)}.${book.format || 'pdf'}"`;
      } else {
        responseHeaders['Content-Disposition'] = 'inline';
        responseHeaders['Cache-Control'] = 'private, no-cache, no-store, must-revalidate';
      }

      res.writeHead(206, responseHeaders);
      fileStream.pipe(res);
    } else {
      const responseHeaders: Record<string, string | number> = {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      };

      if (!isViewer) {
        responseHeaders['Content-Disposition'] = `inline; filename="${encodeURIComponent(book.title)}.${book.format || 'pdf'}"`;
      } else {
        responseHeaders['Content-Disposition'] = 'inline';
        responseHeaders['Cache-Control'] = 'private, no-cache, no-store, must-revalidate';
      }

      res.writeHead(200, responseHeaders);
      fs.createReadStream(resolvedPath).pipe(res);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
}

// GET /api/v1/books/:id/file (Canonical Authenticated Central Reader Stream - Section 17)
router.get('/:id/file', authenticateToken, streamDigitalBook);

// POST /api/v1/books/:id/file & POST /api/v1/books/:id/stream (Immune to IDM / Download Extensions)
router.post('/:id/file', authenticateToken, streamDigitalBook);
router.post('/:id/stream', authenticateToken, streamDigitalBook);

// GET & POST /api/v1/books/:id/content
// Delivers document as JSON Base64 data payload.
// Browser extensions (like IDM) NEVER intercept application/json responses.
async function getDigitalBookContent(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const { rows } = await db.query('SELECT * FROM books WHERE id = $1 LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'سجل الكتاب غير موجود.' } });
    }

    const book = rows[0];
    const resolvedPath = await resolveDigitalBookFilePath(book);

    if (resolvedPath === '__FORBIDDEN_PATH__') {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'مسار الملف غير مصرح به خارج مستودع الكتب الرقمية.' } });
    }

    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'تعذر العثور على ملف الكتاب الرقمي على الخادم المركزي.',
        },
      });
    }

    // Path traversal check: verify path is within allowed digital storage directories
    const { allowedDirs } = await getDigitalStorageContext();
    const isAllowedPath = allowedDirs.some((dir) => isWithinDirectory(resolvedPath, dir));
    if (!isAllowedPath) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'مسار الملف غير مصرح به.' } });
    }

    const buffer = fs.readFileSync(resolvedPath);
    const base64 = buffer.toString('base64');
    const format = (book.format || 'pdf').toLowerCase();

    res.json({
      success: true,
      data: {
        id: book.id,
        title: book.title,
        format,
        sizeBytes: buffer.length,
        base64,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
}

router.get('/:id/content', authenticateToken, getDigitalBookContent);
router.post('/:id/content', authenticateToken, getDigitalBookContent);

// POST /api/v1/books/:id/increment-read
router.post('/:id/increment-read', optionalAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE books SET read_count = COALESCE(read_count, 0) + 1 WHERE id = $1', [id]);
    res.json({ success: true, data: { incremented: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Helper: Reduce physical book copies (Missing/damaged copies retirement)
async function handleReduceBookCopies(req: Request, res: Response, id: string, copiesCount: number, reason: string) {
  const { rows } = await db.query('SELECT * FROM books WHERE id = $1 LIMIT 1', [id]);
  if (rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'BOOK_NOT_FOUND', message: 'الكتاب المطلوب غير موجود في الخادم المركزي.' },
    });
  }

  const book = rows[0];
  if (book.type !== 'physical') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_OPERATION', message: 'خاصية تقليص أو استبعاد النسخ تنطبق على الكتب الورقية فقط.' },
    });
  }

  if (copiesCount <= 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_COPIES_COUNT', message: 'يرجى تحديد عدد نسخ صحيح أكبر من صفر.' },
    });
  }

  const availableCopies = book.available_copies ?? 0;
  const totalCopies = book.total_copies ?? 1;

  if (copiesCount > availableCopies) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_AVAILABLE_COPIES',
        message: `لا يمكن استبعاد ${copiesCount} نسخ؛ النسخ المتوفرة حالياً في المكتبة هي ${availableCopies} فقط (النسخ الأخرى قيد الاستعارة).`,
      },
    });
  }

  // If removing all copies, verify no active loans and delete entire book
  if (copiesCount >= totalCopies) {
    const activeLoans = await db.query(
      "SELECT id FROM loans WHERE book_id = $1 AND status IN ('active', 'extended', 'overdue')",
      [id]
    );
    if (activeLoans.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'HAS_ACTIVE_LOANS',
          message: `لا يمكن حذف هذا الكتاب بالكامل لوجود ${activeLoans.rows.length} إعارة جارية أو متأخرة مرتبطة به.`,
        },
      });
    }

    await db.query('DELETE FROM loans WHERE book_id = $1', [id]);
    await db.query('DELETE FROM books WHERE id = $1', [id]);

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'DELETE_BOOK',
      'book',
      id,
      { title: book.title, type: 'physical', reason: 'REMOVED_ALL_COPIES' },
      req
    );

    return res.json({
      success: true,
      data: {
        message: `تم استبعاد جميع نسخ كتاب "${book.title}" وحذفه بالكامل من الفهرس.`,
        deletedEntireBook: true,
        remainingTotal: 0,
        remainingAvailable: 0,
      },
    });
  }

  // Otherwise, delete the requested number of available physical copies
  await db.query(`
    DELETE FROM physical_copies
    WHERE id IN (
      SELECT id FROM physical_copies
      WHERE book_id = $1 AND status = 'available'
      ORDER BY copy_number DESC
      LIMIT $2
    )
  `, [id, copiesCount]);

  const newTotal = totalCopies - copiesCount;
  const newAvailable = availableCopies - copiesCount;

  await db.query(`
    UPDATE books
    SET total_copies = $1,
        available_copies = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
  `, [newTotal, newAvailable, id]);

  await recordAuditLog(
    req.user!.id,
    req.user!.name,
    req.user!.role,
    'REDUCE_BOOK_COPIES',
    'book',
    id,
    {
      title: book.title,
      copiesRemoved: copiesCount,
      reason,
      remainingTotal: newTotal,
      remainingAvailable: newAvailable,
    },
    req
  );

  return res.json({
    success: true,
    data: {
      message: `تم استبعاد ${copiesCount} نسخة من كتاب "${book.title}" بنجاح (${reason}). المتبقي في الفهرس: ${newTotal} نسخ (${newAvailable} متوفرة).`,
      deletedEntireBook: false,
      remainingTotal: newTotal,
      remainingAvailable: newAvailable,
    },
  });
}

// POST /api/v1/books/:id/reduce-copies (Retire specific copies - Missing / Damaged)
router.post('/:id/reduce-copies', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const copiesCount = Number(req.body?.copiesCount || req.query.copies || 1);
  const reason = req.body?.reason || (req.query.reason as string) || 'استبعاد نسخة مفقودة أو تالفة من الجرد';
  try {
    return await handleReduceBookCopies(req, res, id, copiesCount, reason);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// DELETE /api/v1/books/:id (Delete Entire Book or Specific Copies - Admin & Librarian)
router.delete('/:id', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const copiesCount = Number(req.query.copies || req.body?.copiesCount || 0);
  const reason = (req.query.reason as string) || req.body?.reason || 'استبعاد نسخة مفقودة أو تالفة من الجرد';

  try {
    // If copies parameter is provided and > 0, execute copy reduction workflow
    if (copiesCount > 0) {
      return await handleReduceBookCopies(req, res, id, copiesCount, reason);
    }

    const { rows } = await db.query('SELECT * FROM books WHERE id = $1 LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'BOOK_NOT_FOUND', message: 'الكتاب المطلوب حذفه غير موجود في الخادم المركزي.' }
      });
    }

    const book = rows[0];

    // If physical book, verify there are no active or overdue loans
    if (book.type === 'physical') {
      const activeLoans = await db.query(
        "SELECT id FROM loans WHERE book_id = $1 AND status IN ('active', 'extended', 'overdue')",
        [id]
      );
      if (activeLoans.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'HAS_ACTIVE_LOANS',
            message: `لا يمكن حذف هذا الكتاب لوجود ${activeLoans.rows.length} إعارة جارية أو متأخرة مرتبطة به.`
          }
        });
      }
    }

    // If digital book, safely delete the physical file from disk across active and default repositories
    if (book.type === 'digital') {
      try {
        const { allowedDirs, defaultDir } = await getDigitalStorageContext();

        // 1. Unlink primary resolved file on disk ONLY IF it is located in internal storage
        // (Do NOT delete user's original personal files linked in-place from external directories like Downloads)
        const resolved = await resolveDigitalBookFilePath(book);
        if (resolved && resolved !== '__FORBIDDEN_PATH__' && fs.existsSync(resolved)) {
          const isInternalFile = isWithinDirectory(resolved, defaultDir) ||
                                 isWithinDirectory(resolved, serverConfig.dirs.books) ||
                                 isWithinDirectory(resolved, stagingDir);
          if (isInternalFile) {
            try { fs.unlinkSync(resolved); } catch {}
          } else {
            console.log(`[Books] Digital book ${id} unlinked from database; external in-place file preserved on disk: ${resolved}`);
          }
        }

        // 2. Also ensure cleanup from default digital directory if a local copy exists
        const candidateNames = [
          book.file_path ? path.basename(book.file_path) : null,
          book.file_url ? path.basename(decodeURIComponent(book.file_url)) : null,
          book.id && book.format ? `${book.id}.${book.format}` : null,
          book.title && book.format ? `${book.title.trim()}.${book.format.trim()}` : null,
        ].filter(Boolean) as string[];

        for (const cName of candidateNames) {
          const defaultPath = path.join(defaultDir, cName);
          if (fs.existsSync(defaultPath) && isWithinDirectory(defaultPath, defaultDir)) {
            try { fs.unlinkSync(defaultPath); } catch {}
          }
        }

        // 3. Unlink local cover image if uploaded
        if (book.cover_image && typeof book.cover_image === 'string' && book.cover_image.includes('/covers/')) {
          const coverName = path.basename(decodeURIComponent(book.cover_image));
          const coverPath = path.join(serverConfig.dirs.covers, coverName);
          if (fs.existsSync(coverPath) && isWithinDirectory(coverPath, serverConfig.dirs.covers)) {
            try { fs.unlinkSync(coverPath); } catch {}
          }
        }
      } catch (fileErr) {
        console.warn('Notice: could not unlink digital file on disk:', fileErr);
      }
    }

    // Delete related records and book
    await db.query('DELETE FROM loans WHERE book_id = $1', [id]);
    await db.query('DELETE FROM books WHERE id = $1', [id]);

    await recordAuditLog(
      req.user!.id,
      req.user!.name,
      req.user!.role,
      'DELETE_BOOK',
      'book',
      id,
      { title: book.title, type: book.type },
      req
    );

    res.json({
      success: true,
      data: { message: `تم حذف الكتاب "${book.title}" بنجاح من الخادم المركزي.` }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

export default router;
