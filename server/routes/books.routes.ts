import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/pool';
import { serverConfig } from '../config';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';

const router = Router();

// Multer storage engine saving safely outside source code in LibraryData/
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
          title: b.title,
          author: b.author,
          publisher: b.publisher,
          publishYear: b.publish_year,
          isbn: b.isbn,
          categoryId: b.category_id,
          location: {
            cabinet: b.cabinet || '',
            shelf: b.shelf || '',
            section: b.section || '',
          },
          totalCopies: b.total_copies || 1,
          availableCopies: b.available_copies !== undefined ? b.available_copies : 1,
          summary: b.summary || '',
          coverImage: b.cover_image,
          pages: b.pages_count,
          language: b.language || 'العربية',
          tags: Array.isArray(b.tags) ? b.tags : [],
          addedAt: b.created_at,
        };
      } else {
        return {
          id: b.id,
          title: b.title,
          author: b.author,
          categoryId: b.category_id,
          format: b.format || 'pdf',
          fileSize: b.file_size || '0 MB',
          fileUrl: b.file_url,
          pagesCount: b.pages_count || 0,
          summary: b.summary || '',
          coverImage: b.cover_image,
          sourceOrigin: b.source_origin,
          uploadedBy: b.uploaded_by,
          tags: Array.isArray(b.tags) ? b.tags : [],
          downloadCount: b.download_count || 0,
          readCount: b.read_count || 0,
          addedAt: b.created_at,
          tableOfContents: typeof b.table_of_contents === 'string' ? JSON.parse(b.table_of_contents) : (b.table_of_contents || []),
          sampleContent: typeof b.sample_content === 'string' ? JSON.parse(b.sample_content) : (b.sample_content || []),
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
      return res.status(404).json({ success: false, error: { code: 'BOOK_NOT_FOUND', message: 'الكتاب غير موجود.' } });
    }
    const b = rows[0];
    res.json({ success: true, data: b });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/books/bulk (Admin bulk add digital books)
router.post('/bulk', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { books } = req.body;
  if (!Array.isArray(books) || books.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'مصفوفة الكتب مطلوبة.' } });
  }

  try {
    let addedCount = 0;
    await db.transaction(async (client) => {
      for (const b of books) {
        const id = b.id || `dig-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await client.query(`
          INSERT INTO books (
            id, type, title, author, category_id, format, file_size, file_url,
            pages_count, summary, cover_image, source_origin, uploaded_by, tags,
            download_count, read_count, table_of_contents, sample_content
          ) VALUES ($1, 'digital', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, 0, $14, $15)
        `, [
          id,
          b.title,
          b.author,
          b.categoryId || 'cat-general',
          b.format || 'pdf',
          b.fileSize || '1.5 MB',
          b.fileUrl || null,
          b.pagesCount || 0,
          b.summary || '',
          b.coverImage || null,
          b.sourceOrigin || null,
          req.user!.id,
          b.tags || [],
          JSON.stringify(b.tableOfContents || []),
          JSON.stringify(b.sampleContent || []),
        ]);
        addedCount++;
      }
    });

    res.status(201).json({ success: true, data: { count: addedCount, message: `تمت إضافة ${addedCount} كتاب بنجاح.` } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/books (Admin only)
router.post('/', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const book = req.body;
  const isPhysical = book.type === 'physical' || !book.format;

  try {
    const id = book.id || `${isPhysical ? 'phys' : 'dig'}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

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
        // Digital Book
        await client.query(`
          INSERT INTO books (
            id, type, title, author, category_id, format, file_size, file_url,
            pages_count, summary, cover_image, source_origin, uploaded_by, tags,
            download_count, read_count, table_of_contents, sample_content
          ) VALUES ($1, 'digital', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, 0, $14, $15)
        `, [
          id,
          book.title,
          book.author,
          book.categoryId || 'cat-general',
          book.format || 'pdf',
          book.fileSize || '1.5 MB',
          book.fileUrl || null,
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

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'CREATE_BOOK', 'book', id, { title: book.title, type: isPhysical ? 'physical' : 'digital' }, req);

    res.status(201).json({
      success: true,
      data: { id, ...book, addedAt: new Date().toISOString() },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PUT /api/v1/books/:id
router.put('/:id', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const book = req.body;

  try {
    if (book.type === 'physical' || book.location) {
      await db.query(`
        UPDATE books SET
          title = $1, author = $2, publisher = $3, publish_year = $4, isbn = $5,
          category_id = $6, summary = $7, pages_count = $8, tags = $9,
          cover_image = $10, total_copies = $11, available_copies = $12,
          cabinet = $13, shelf = $14, section = $15
        WHERE id = $16
      `, [
        book.title,
        book.author,
        book.publisher || null,
        book.publishYear || null,
        book.isbn || null,
        book.categoryId,
        book.summary || '',
        book.pages || 0,
        book.tags || [],
        book.coverImage || null,
        book.totalCopies || 1,
        book.availableCopies || 1,
        book.location?.cabinet || '',
        book.location?.shelf || '',
        book.location?.section || '',
        id,
      ]);
    } else {
      await db.query(`
        UPDATE books SET
          title = $1, author = $2, category_id = $3, summary = $4,
          pages_count = $5, tags = $6, cover_image = $7, source_origin = $8
        WHERE id = $9
      `, [
        book.title,
        book.author,
        book.categoryId,
        book.summary || '',
        book.pagesCount || 0,
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

// POST /api/v1/books/upload (Multer File Upload into Central Storage)
router.post('/upload', authenticateToken, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const uploadedFile = files['file'] ? files['file'][0] : null;
    const uploadedCover = files['cover'] ? files['cover'][0] : null;

    res.json({
      success: true,
      data: {
        fileUrl: uploadedFile ? `/api/v1/books/files/digital/${uploadedFile.filename}` : null,
        coverUrl: uploadedCover ? `/api/v1/books/files/covers/${uploadedCover.filename}` : null,
        fileSize: uploadedFile ? `${(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB` : null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'UPLOAD_FAILED', message: err.message } });
  }
});

// GET /api/v1/books/:id/file (Secure File Delivery with HTTP Range Streaming and Path Traversal Protection)
router.get('/:id/file', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query('SELECT * FROM books WHERE id = $1 LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'سجل الكتاب غير موجود.' } });
    }

    const book = rows[0];
    let targetFilePath = book.file_path;

    // If file_path is not explicitly set, look in digital storage directory by file_url filename
    if (!targetFilePath && book.file_url && typeof book.file_url === 'string') {
      const filename = path.basename(book.file_url);
      targetFilePath = path.join(serverConfig.dirs.digital, filename);
    }

    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      return res.json({
        success: true,
        data: {
          message: 'قراءة مدمجة متوفرة عبر المستعرض.',
          sampleContent: typeof book.sample_content === 'string' ? JSON.parse(book.sample_content) : (book.sample_content || []),
        },
      });
    }

    // Path Traversal Security Verification
    const resolvedPath = path.resolve(targetFilePath);
    const digitalDir = path.resolve(serverConfig.dirs.digital);
    const booksDir = path.resolve(serverConfig.dirs.books);
    if (!resolvedPath.startsWith(digitalDir) && !resolvedPath.startsWith(booksDir)) {
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'مسار الملف غير مصرح به.' } });
    }

    const stat = fs.statSync(resolvedPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = book.format === 'epub' ? 'application/epub+zip' : 'application/pdf';

    if (range) {
      // Parse Range header (e.g. "bytes=0-1024")
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
