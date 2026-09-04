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
  const relative = path.relative(resolvedParent, resolvedTarget);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

// Helper to extract clean Title & Author from filename patterns (Section 23 Requirement)
function extractTitleAndAuthor(filename: string): { title: string; author: string } {
  const base = path.basename(filename, path.extname(filename))
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Pattern: "العنوان - المؤلف" or "العنوان للشيخ المؤلف" or "العنوان تأليف المؤلف"
  if (base.includes(' - ')) {
    const parts = base.split(' - ');
    return { title: parts[0].trim(), author: parts.slice(1).join(' ').trim() };
  }
  if (base.includes(' للشيخ ')) {
    const parts = base.split(' للشيخ ');
    return { title: parts[0].trim(), author: `الشيخ ${parts[1].trim()}` };
  }
  if (base.includes(' تأليف ')) {
    const parts = base.split(' تأليف ');
    return { title: parts[0].trim(), author: parts[1].trim() };
  }
  if (base.includes(' تحقيق ')) {
    const parts = base.split(' تحقيق ');
    return { title: parts[0].trim(), author: `تحقيق ${parts[1].trim()}` };
  }

  return { title: base, author: 'مؤلف غير محدد' };
}

// Automatic Classification Algorithm using MISHKAT Category Model (Section 24 Requirement)
function classifyBook(
  title: string,
  author: string,
  filename: string,
  categories: any[]
): { categoryId: string; categoryName: string; confidence: number } {
  const text = `${title} ${author} ${filename}`.toLowerCase();

  const rules: { keywords: string[]; catId: string; name: string; weight: number }[] = [
    {
      keywords: ['فقه', 'عقيدة', 'شريعة', 'حديث', 'تفسير', 'قرآن', 'إباضي', 'سالمي', 'جيطالي', 'بخاري', 'مسلم', 'أصول', 'صلاة', 'زكاة', 'صوم', 'حج', 'وفاء', 'استقامة'],
      catId: 'cat-islamic',
      name: 'العلوم الشرعية',
      weight: 40,
    },
    {
      keywords: ['تاريخ', 'حضارة', 'عمان', 'أندلس', 'طبري', 'سيرة', 'فتوح', 'معركة', 'دولة', 'خلافة', 'يعاربة', 'بوسعيدي', 'أعيان'],
      catId: 'cat-history',
      name: 'التاريخ والحضارة',
      weight: 40,
    },
    {
      keywords: ['نحو', 'إعراب', 'بلاغة', 'معجم', 'ألفية', 'لسان', 'سيبويه', 'جرجاني', 'شعر', 'ديوان', 'لغة', 'صرف', 'عروض', 'أدب'],
      catId: 'cat-arabic',
      name: 'اللغة العربية وآدابها',
      weight: 40,
    },
    {
      keywords: ['علوم', 'فيزياء', 'كيمياء', 'أحياء', 'فلك', 'طب', 'طبيعة', 'كون', 'بيئة', 'هندسة', 'تقنية', 'حاسوب', 'برمجة', 'ذكاء'],
      catId: 'cat-science',
      name: 'العلوم الطبيعية والتقنية',
      weight: 40,
    },
    {
      keywords: ['رواية', 'قصة', 'أدب', 'مسرحية', 'حكاية', 'نصوص', 'مقامات', 'أساطير', 'أدبي', 'ناشئة'],
      catId: 'cat-literature',
      name: 'الأدب والروايات',
      weight: 35,
    },
  ];

  let bestCatId = categories[0]?.id || 'cat-general';
  let bestCatName = categories[0]?.name || 'عام';
  let bestScore = 0;

  for (const rule of rules) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        score += rule.weight;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      const matched = categories.find((c) => c.id === rule.catId || c.name.includes(rule.name));
      if (matched) {
        bestCatId = matched.id;
        bestCatName = matched.name;
      } else {
        bestCatName = rule.name;
      }
    }
  }

  const confidence = Math.min(100, Math.max(25, bestScore));
  return { categoryId: bestCatId, categoryName: bestCatName, confidence };
}

// Helper to resolve digital book file path safely across local, digital dirs and configured root URL (Section 17 & 19 Requirement)
async function resolveDigitalBookFilePath(book: any): Promise<string | null> {
  const allowedDirectories: string[] = [
    serverConfig.dirs.digital,
    serverConfig.dirs.books,
    stagingDir,
  ];

  // Check admin configured digital root URL (Section 19 Requirement)
  try {
    const { rows } = await db.query("SELECT value FROM system_settings WHERE key = 'library_config' LIMIT 1");
    if (rows.length > 0) {
      const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      if (val?.digitalBookRootUrl) {
        const rootPath = path.isAbsolute(val.digitalBookRootUrl)
          ? val.digitalBookRootUrl
          : path.join(process.cwd(), val.digitalBookRootUrl);
        allowedDirectories.push(path.resolve(rootPath));
      }
    }
  } catch {}

  const candidates: string[] = [];

  if (book.file_path) {
    if (path.isAbsolute(book.file_path)) {
      candidates.push(book.file_path);
    } else {
      candidates.push(path.join(serverConfig.dirs.digital, path.basename(book.file_path)));
      candidates.push(path.join(serverConfig.dirs.digital, book.file_path));
    }
  }

  if (book.file_url) {
    const fname = path.basename(book.file_url);
    candidates.push(path.join(serverConfig.dirs.digital, fname));
    candidates.push(path.join(serverConfig.dirs.books, fname));
    candidates.push(path.join(stagingDir, fname));
  }

  for (const cand of candidates) {
    const resolved = path.resolve(cand);
    if (fs.existsSync(resolved)) {
      // Check if file is within allowed digital directories
      const isAllowed = allowedDirectories.some((dir) => isWithinDirectory(resolved, dir));
      if (isAllowed) {
        return resolved;
      } else {
        // Explicitly marked as forbidden path outside digital storage
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

    const stagedResults: any[] = [];

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '') as 'pdf' | 'epub';
      const stagedFilePath = file.path;

      // Calculate SHA-256
      const buffer = fs.readFileSync(stagedFilePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const sizeMb = Number((file.size / (1024 * 1024)).toFixed(2));

      // Extract title & author
      const { title, author } = extractTitleAndAuthor(file.originalname);

      // Automatic classification (Section 24)
      const { categoryId, categoryName, confidence } = classifyBook(title, author, file.originalname, categories);

      // Duplicate detection (Section 26)
      const { rows: dupHashRows } = await db.query('SELECT id, title FROM books WHERE file_hash = $1 LIMIT 1', [hash]);
      const isDuplicate = dupHashRows.length > 0;
      const duplicateReason = isDuplicate ? `الكتاب موجود مسبقاً بنفس البصمة (${dupHashRows[0].title})` : null;

      const status = isDuplicate ? 'duplicate' : confidence < 40 ? 'needs_review' : 'ready';

      stagedResults.push({
        tempId: path.basename(file.filename, path.extname(file.filename)),
        originalFileName: file.originalname,
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
        pages: Math.max(50, Math.round(sizeMb * 45)),
        summary: `كتاب رقمي تم استخراجه وفرزه آلياً من الملف المرفوع: ${file.originalname}`,
      });
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
  const { folderPath } = req.body;

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

    const { rows: categories } = await db.query('SELECT id, name FROM categories ORDER BY name ASC');

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

    const scannedResults: any[] = [];
    for (const filePath of discoveredFiles) {
      const fileName = path.basename(filePath);
      const ext = path.extname(fileName).toLowerCase().replace('.', '') as 'pdf' | 'epub';
      const stat = fs.statSync(filePath);
      const sizeMb = Number((stat.size / (1024 * 1024)).toFixed(2));

      // Calculate SHA-256
      const buffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      const { title, author } = extractTitleAndAuthor(fileName);
      const { categoryId, categoryName, confidence } = classifyBook(title, author, fileName, categories);

      const { rows: dupHashRows } = await db.query('SELECT id, title FROM books WHERE file_hash = $1 LIMIT 1', [hash]);
      const isDuplicate = dupHashRows.length > 0;

      scannedResults.push({
        tempId: `scan-${hash.substring(0, 8)}`,
        originalFileName: fileName,
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
        duplicateReason: isDuplicate ? `موجود مسبقاً بنفس البصمة (${dupHashRows[0].title})` : null,
        pages: Math.max(50, Math.round(sizeMb * 45)),
        summary: `كتاب رقمي تم اكتشافه من المجلد: ${path.relative(resolvedDir, filePath)}`,
      });
    }

    res.json({
      success: true,
      data: {
        rootScanned: resolvedDir,
        totalDiscovered: scannedResults.length,
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
          const finalFileName = `${bookId}.${format}`;
          const finalFilePath = path.join(serverConfig.dirs.digital, finalFileName);

          try {
            if (stagedFilePath.includes(stagingDir)) {
              fs.renameSync(stagedFilePath, finalFilePath);
            } else {
              fs.copyFileSync(stagedFilePath, finalFilePath);
            }
          } catch {
            fs.copyFileSync(stagedFilePath, finalFilePath);
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
          book.pagesCount || 0,
          book.summary || '',
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
        book.pagesCount || 0,
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

// DELETE /api/v1/books/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { rows: activeLoans } = await db.query(
      "SELECT id FROM loans WHERE book_id = $1 AND status != 'returned'",
      [id]
    );
    if (activeLoans.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ACTIVE_LOANS_EXIST',
          message: `لا يمكن حذف هذا الكتاب لوجود ${activeLoans.length} عملية إعارة نشطة مرتبطة به حالياً.`,
        },
      });
    }

    await db.query('DELETE FROM books WHERE id = $1', [id]);
    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'DELETE_BOOK', 'book', id, null, req);
    res.json({ success: true, data: { message: 'تم حذف الكتاب من الخادم المركزي بنجاح.' } });
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
router.get('/files/digital/:filename', authenticateToken, (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.filename);
  const targetPath = path.join(serverConfig.dirs.digital, safeFilename);

  if (!isWithinDirectory(targetPath, serverConfig.dirs.digital) || !fs.existsSync(targetPath)) {
    return res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'الملف الرقمي غير موجود.' } });
  }

  res.sendFile(path.resolve(targetPath));
});

// GET /api/v1/books/:id/file (Canonical Authenticated Central Reader Stream - Section 17)
router.get('/:id/file', authenticateToken, async (req: Request, res: Response) => {
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

    // Path traversal check
    const projectRoot = path.resolve(process.cwd());
    const relative = path.relative(projectRoot, resolvedPath);
    if (relative.startsWith('..') && !isWithinDirectory(resolvedPath, serverConfig.dirs.root)) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'مسار الملف غير مصرح به.' } });
    }

    const stat = fs.statSync(resolvedPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = (book.format || 'pdf').toLowerCase() === 'epub' ? 'application/epub+zip' : 'application/pdf';

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

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(book.title)}.${book.format || 'pdf'}"`,
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(book.title)}.${book.format || 'pdf'}"`,
      });

      fs.createReadStream(resolvedPath).pipe(res);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

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

export default router;
