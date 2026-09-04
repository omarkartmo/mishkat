import { Router, Request, Response } from 'express';
import { db } from '../db/pool';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { recordAuditLog } from '../middleware/audit';
import fs from 'fs';
import path from 'path';
import { DigitalDownloadService } from '../services/portals/digitalDownloadService';

const router = Router();

// Helper to normalize submission status
function normalizeStatus(s: string): string {
  if (s === 'pending') return 'PENDING_REVIEW';
  if (s === 'approved') return 'APPROVED';
  if (s === 'rejected') return 'REJECTED';
  return s;
}

// GET /api/v1/submissions
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    let sql = 'SELECT * FROM pending_submissions WHERE 1=1';
    const params: any[] = [];

    if (req.user!.role === 'student') {
      params.push(req.user!.id);
      sql += ` AND student_id = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await db.query(sql, params);

    const formatted = rows.map((s) => ({
      id: s.id,
      title: s.title,
      author: s.author,
      suggestedCategoryId: s.suggested_category_id,
      format: s.format,
      sourceUrl: s.source_url || s.source_record_url,
      sourcePortalName: s.source_portal_name,
      sourcePortalId: s.source_portal_id,
      sourceRecordId: s.source_record_id,
      sourceRecordUrl: s.source_record_url || s.source_url,
      sourceMethod: s.source_method || 'OFFICIAL_CATALOG',
      sourceRetrievedAt: s.source_retrieved_at,
      verificationStatus: s.verification_status || 'UNVERIFIED',
      downloadUrl: s.download_url,
      serverFilePath: s.server_file_path,
      serverFileSize: s.server_file_size,
      serverFileHash: s.server_file_hash,
      summary: s.summary,
      studentId: s.student_id,
      studentName: s.student_name,
      studentRegNumber: s.student_reg_number,
      submittedAt: s.submitted_at,
      status: normalizeStatus(s.status),
      adminFeedback: s.admin_feedback,
      reviewedAt: s.reviewed_at,
      reviewedBy: s.reviewed_by,
      pagesEstimated: s.pages_estimated,
      isbn: s.isbn,
      language: s.language,
      coverImage: s.cover_image,
      notes: s.notes,
      category: s.category,
    }));

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/submissions (Student submits research document/book suggestion)
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const {
    title,
    author,
    suggestedCategoryId,
    sourceUrl,
    sourcePortalName,
    sourcePortalId,
    sourceRecordId,
    sourceRecordUrl,
    downloadUrl,
    sourceMethod = 'MANUAL_VERIFIED_CATALOG',
    sourceRetrievedAt,
    verificationStatus = 'USER_SUGGESTED',
    summary,
    format = 'pdf',
    pagesEstimated = 200,
    isbn,
    language = 'العربية',
    coverImage,
    notes,
    category,
  } = req.body;

  // Section 5 Validation Rules:
  // REQUIRED: title, author if known, source portal, source book/page URL.
  // OPTIONAL: download URL, ISBN, language, category, cover, description, notes.
  const effectivePageUrl = (sourceRecordUrl || sourceUrl || '').trim();

  if (!title || !title.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_TITLE', message: 'عنوان الكتاب أو المخطوطة إلزامي.' },
    });
  }

  if (!sourcePortalName || !sourcePortalName.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_PORTAL', message: 'اسم البوابة أو الموقع المعتمد المصدر إلزامي.' },
    });
  }

  // If source page URL is missing, mark verificationStatus as INCOMPLETE_PROVENANCE (Phase 15.4-G Section 2)
  let initialVerificationStatus = verificationStatus;
  if (!effectivePageUrl) {
    initialVerificationStatus = 'INCOMPLETE_PROVENANCE';
  }

  try {
    const id = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const submittedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const initialStatus = 'PENDING_REVIEW';

    await db.query(`
      INSERT INTO pending_submissions (
        id, title, author, suggested_category_id, format, source_url, source_portal_name,
        summary, student_id, student_name, student_reg_number, submitted_at, status, pages_estimated,
        source_portal_id, source_record_id, source_record_url, source_method, source_retrieved_at, verification_status,
        download_url, isbn, language, cover_image, notes, category
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
    `, [
      id,
      title.trim(),
      author ? author.trim() : 'مؤلف غير محدد',
      suggestedCategoryId || 'cat-general',
      format,
      effectivePageUrl,
      sourcePortalName.trim(),
      summary || '',
      req.user!.id,
      req.user!.name,
      req.user!.registrationNumber,
      submittedAt,
      initialStatus,
      Number(pagesEstimated) || 200,
      sourcePortalId || null,
      sourceRecordId || null,
      effectivePageUrl,
      sourceMethod,
      sourceRetrievedAt || new Date().toISOString(),
      initialVerificationStatus,
      downloadUrl ? downloadUrl.trim() : null,
      isbn || null,
      language || 'العربية',
      coverImage || null,
      notes || null,
      category || null,
    ]);

    // Distinct Notification: NEW BOOK SUGGESTION (Section 6 Requirement)
    await db.query(`
      INSERT INTO notifications (
        id, recipient_id, recipient_role, title, message, type, target_tab, target_entity_id, is_read, created_at
      ) VALUES ($1, 'admin', 'admin', $2, $3, 'new_book_suggestion', 'reviews', $4, false, $5)
    `, [
      `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      'اقتراح كتاب رقمي جديد',
      `اقترح الطالب ${req.user!.name} إضافة كتاب "${title.trim()}" من بوابة ${sourcePortalName.trim()}.`,
      id,
      submittedAt,
    ]);

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'SUBMIT_BOOK', 'submission', id, { title, sourcePortalName }, req);

    res.status(201).json({
      success: true,
      data: {
        id,
        title,
        author: author || 'مؤلف غير محدد',
        suggestedCategoryId,
        format,
        sourceUrl: effectivePageUrl,
        sourcePortalName,
        summary,
        studentId: req.user!.id,
        studentName: req.user!.name,
        studentRegNumber: req.user!.registrationNumber,
        submittedAt,
        status: initialStatus,
        pagesEstimated,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// PUT /api/v1/submissions/:id (Admin edits metadata before approval - Section 7 Requirement)
router.put('/:id', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, author, suggestedCategoryId, summary, isbn, language, downloadUrl } = req.body;

  try {
    const { rows } = await db.query('SELECT * FROM pending_submissions WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الطلب غير موجود.' } });
    }

    await db.query(`
      UPDATE pending_submissions SET
        title = COALESCE($1, title),
        author = COALESCE($2, author),
        suggested_category_id = COALESCE($3, suggested_category_id),
        summary = COALESCE($4, summary),
        isbn = COALESCE($5, isbn),
        language = COALESCE($6, language),
        download_url = COALESCE($7, download_url)
      WHERE id = $8
    `, [
      title ? title.trim() : null,
      author ? author.trim() : null,
      suggestedCategoryId || null,
      summary !== undefined ? summary : null,
      isbn || null,
      language || null,
      downloadUrl ? downloadUrl.trim() : null,
      id,
    ]);

    res.json({ success: true, data: { message: 'تم تحديث بيانات الاقتراح بنجاح.' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// POST /api/v1/submissions/:id/review (Admin workflow with State Machine: PENDING_REVIEW, NEEDS_MANUAL_ACQUISITION, READY_FOR_FINAL_APPROVAL, APPROVED, REJECTED)
router.post('/:id/review', authenticateToken, requireRole('admin', 'librarian'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    status,
    adminFeedback,
    categoryId,
    title: updatedTitle,
    author: updatedAuthor,
    manualFilePath,
  } = req.body;

  const validStatuses = [
    'approved',
    'rejected',
    'pending',
    'APPROVED',
    'REJECTED',
    'NEEDS_MANUAL_ACQUISITION',
    'READY_FOR_FINAL_APPROVAL',
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'حالة المراجعة غير صالحة.' } });
  }

  const normalizedActionStatus = normalizeStatus(status);

  try {
    const reviewedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

    let resultMessage = '';

    await db.transaction(async (client) => {
      const { rows: subRows } = await client.query('SELECT * FROM pending_submissions WHERE id = $1', [id]);
      if (subRows.length === 0) {
        throw new Error('الطلب غير موجود.');
      }
      const sub = subRows[0];

      // Update editable metadata if provided
      const finalTitle = (updatedTitle || sub.title).trim();
      const finalAuthor = (updatedAuthor || sub.author).trim();
      const finalCategoryId = categoryId || sub.suggested_category_id || 'cat-general';

      // ==========================================
      // FLOW 1: REJECTION [رفض]
      // ==========================================
      if (normalizedActionStatus === 'REJECTED') {
        await client.query(`
          UPDATE pending_submissions SET
            status = 'REJECTED', admin_feedback = $1, reviewed_at = $2, reviewed_by = $3
          WHERE id = $4
        `, [adminFeedback || 'تم رفض الاقتراح لعدم توافقه مع المعايير الأكاديمية.', reviewedAt, req.user!.id, id]);

        // Student notification
        await client.query(`
          INSERT INTO notifications (
            id, recipient_id, recipient_role, title, message, type, target_tab, target_entity_id, is_read, created_at
          ) VALUES ($1, $2, 'student', $3, $4, 'book_rejected', 'portals', $5, false, $6)
        `, [
          `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          sub.student_id,
          'تحديث بخصوص الكتاب المقترح',
          `نعتذر، لم تتم الموافقة على إضافة كتاب "${finalTitle}". ${adminFeedback || ''}`,
          id,
          reviewedAt,
        ]);

        resultMessage = 'تم رفض الاقتراح مع إشعار الطالب بالسبب.';
      }

      // ==========================================
      // FLOW 2: MANUAL ACQUISITION [انتظار الاستحواذ اليدوي]
      // ==========================================
      else if (normalizedActionStatus === 'NEEDS_MANUAL_ACQUISITION') {
        await client.query(`
          UPDATE pending_submissions SET
            status = 'NEEDS_MANUAL_ACQUISITION',
            title = $1, author = $2, suggested_category_id = $3,
            admin_feedback = $4, reviewed_at = $5, reviewed_by = $6
          WHERE id = $7
        `, [finalTitle, finalAuthor, finalCategoryId, adminFeedback || null, reviewedAt, req.user!.id, id]);

        // Distinct Notification: BOOK WAITING FOR MANUAL ACQUISITION (Section 6 Requirement)
        await client.query(`
          INSERT INTO notifications (
            id, recipient_id, recipient_role, title, message, type, target_tab, target_entity_id, is_read, created_at
          ) VALUES ($1, 'admin', 'admin', $2, $3, 'book_needs_manual_acquisition', 'reviews', $4, false, $5)
        `, [
          `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          'كتاب بانتظار الاستحواذ اليدوي',
          `يتطلب كتاب "${finalTitle}" تدقيقاً واستحواذاً يدوياً من المصدر (${sub.source_portal_name}).`,
          id,
          reviewedAt,
        ]);

        resultMessage = 'تم تحويل الكتاب لحالة انتظار الاستحواذ اليدوي.';
      }

      // ==========================================
      // FLOW 3: READY FOR FINAL APPROVAL [جاهز للاعتماد النهائي]
      // ==========================================
      else if (normalizedActionStatus === 'READY_FOR_FINAL_APPROVAL') {
        await client.query(`
          UPDATE pending_submissions SET
            status = 'READY_FOR_FINAL_APPROVAL',
            server_file_path = COALESCE($1, server_file_path),
            reviewed_at = $2, reviewed_by = $3
          WHERE id = $4
        `, [manualFilePath || null, reviewedAt, req.user!.id, id]);

        // Distinct Notification: BOOK WAITING FOR FINAL APPROVAL (Section 6 Requirement)
        await client.query(`
          INSERT INTO notifications (
            id, recipient_id, recipient_role, title, message, type, target_tab, target_entity_id, is_read, created_at
          ) VALUES ($1, 'admin', 'admin', $2, $3, 'book_waiting_final_approval', 'reviews', $4, false, $5)
        `, [
          `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          'كتاب بانتظار الموافقة النهائية',
          `تم تجهيز ملف كتاب "${finalTitle}" وهو بانتظار الاعتماد النهائي من الإدارة.`,
          id,
          reviewedAt,
        ]);

        resultMessage = 'تم تجهيز الكتاب للاعتماد النهائي.';
      }

      // ==========================================
      // FLOW 4: ACCEPT / FINAL APPROVAL [قبول / اعتماد تلقائي أو نهائي]
      // ==========================================
      else if (normalizedActionStatus === 'APPROVED') {
        // Section 18: Zero tolerance for fake/test PDFs.
        // We MUST verify real file exists either via downloadUrl (Case A) or manual acquisition (Case B).

        const bookId = `dig-sub-${Date.now()}`;
        let finalFilePath: string | null = manualFilePath || sub.server_file_path || null;
        let finalFileSize: string = sub.server_file_size || '1.0 MB';
        let finalFileHash: string | null = sub.server_file_hash || null;
        let finalFileUrl: string | null = null;

        // CASE A: Direct download URL is present -> Attempt automatic server-side download & validation
        if (sub.download_url && !finalFilePath) {
          try {
            const downloadRes = await DigitalDownloadService.downloadAndValidate(sub.download_url, {
              bookId,
              format: sub.format || 'pdf',
              allowLocalhost: process.env.NODE_ENV === 'test',
            });
            finalFilePath = downloadRes.filePath;
            finalFileSize = downloadRes.fileSizeStr;
            finalFileHash = downloadRes.fileHash;
          } catch (dlErr: any) {
            // Case B transition: if remote link is not directly downloadable, transition explicitly to NEEDS_MANUAL_ACQUISITION
            await client.query(`
              UPDATE pending_submissions SET
                status = 'NEEDS_MANUAL_ACQUISITION',
                admin_feedback = $1,
                reviewed_at = $2,
                reviewed_by = $3
              WHERE id = $4
            `, [
              `تعذر التحميل التلقائي: ${dlErr.message}. تم تحويل الطلب للاستحواذ اليدوي.`,
              reviewedAt,
              req.user!.id,
              id,
            ]);

            throw new Error(
              `فشل تحميل الملف الرقمي: الرابط المدخل ليس ملفاً مباشراً قابلاً للتحميل (${dlErr.message}). تم نقل الطلب إلى حالة [بانتظار الاستحواذ اليدوي] ليقوم المشرف بفتحه يدويًا.`
            );
          }
        }

        // Duplicate Integrity Check (Section 8 & 26) - Check metadata provenance duplicates first
        // 1. Same source portal ID + source record ID
        if (sub.source_portal_id && sub.source_record_id) {
          const { rows: dupPortalRecRows } = await client.query(
            'SELECT id, title FROM books WHERE source_portal_id = $1 AND source_record_id = $2 LIMIT 1',
            [sub.source_portal_id, sub.source_record_id]
          );
          if (dupPortalRecRows.length > 0) {
            throw new Error(`الكتاب موجود مسبقاً في المستودع الرقمي بنفس معرف البوابة والسجل (${dupPortalRecRows[0].id} - ${dupPortalRecRows[0].title}).`);
          }
        }

        // 2. Same source portal + source record URL
        if (sub.source_record_url) {
          const { rows: dupUrlRows } = await client.query(
            'SELECT id, title FROM books WHERE source_record_url = $1 LIMIT 1',
            [sub.source_record_url]
          );
          if (dupUrlRows.length > 0) {
            throw new Error(`الكتاب مضاف مسبقاً من نفس الرابط المصدري (${dupUrlRows[0].id} - ${dupUrlRows[0].title}).`);
          }
        }

        // Check if file physically exists (Section 18 & 27)
        if (!finalFilePath || !fs.existsSync(finalFilePath)) {
          // If no downloadable URL and no attached physical file, do NOT fake a file!
          await client.query(`
            UPDATE pending_submissions SET
              status = 'NEEDS_MANUAL_ACQUISITION',
              admin_feedback = 'لا يوجد ملف رقمي محمل بعد. يتطلب استحواذاً يدوياً وإرفاق الملف.',
              reviewed_at = $1,
              reviewed_by = $2
            WHERE id = $3
          `, [reviewedAt, req.user!.id, id]);

          throw new Error(
            'MANUAL_ACQUISITION_REQUIRED: لم يتم العثور على ملف رقمي حقيقي للكتاب. لا يمكن الاعتماد بملف وهمي. تم نقل الطلب إلى [بانتظار الاستحواذ اليدوي].'
          );
        }

        // 3. Same SHA-256 Hash
        if (finalFileHash) {
          const { rows: dupHashRows } = await client.query(
            'SELECT id, title FROM books WHERE file_hash = $1 LIMIT 1',
            [finalFileHash]
          );
          if (dupHashRows.length > 0) {
            throw new Error(`تم العثور على نفس ملف الكتاب مسبقاً في المستودع الرقمي بتطابق البصمة الرقمية SHA-256 (${dupHashRows[0].id} - ${dupHashRows[0].title}).`);
          }
        }

        finalFileUrl = `/api/v1/books/${bookId}/file`;

        // Update submission status to APPROVED and record server file metadata
        await client.query(`
          UPDATE pending_submissions SET
            status = 'APPROVED',
            title = $1, author = $2, suggested_category_id = $3,
            server_file_path = $4, server_file_size = $5, server_file_hash = $6,
            reviewed_at = $7, reviewed_by = $8
          WHERE id = $9
        `, [
          finalTitle,
          finalAuthor,
          finalCategoryId,
          finalFilePath,
          finalFileSize,
          finalFileHash,
          reviewedAt,
          req.user!.id,
          id,
        ]);

        // Insert into central books repository
        await client.query(`
          INSERT INTO books (
            id, type, title, author, category_id, format, file_size, file_path, file_url, file_hash,
            pages_count, summary, source_origin, source_portal_id, source_record_id, source_record_url,
            download_url, uploaded_by, tags, download_count, read_count, isbn, language, cover_image
          ) VALUES ($1, 'digital', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, ARRAY['مكتبة معتمدة', 'مُعتمد حديثاً'], 0, 0, $18, $19, $20)
        `, [
          bookId,
          finalTitle,
          finalAuthor,
          finalCategoryId,
          sub.format || 'pdf',
          finalFileSize,
          finalFilePath,
          finalFileUrl,
          finalFileHash,
          sub.pages_estimated || 200,
          sub.summary || '',
          sub.source_portal_name,
          sub.source_portal_id,
          sub.source_record_id,
          sub.source_record_url,
          sub.download_url,
          sub.student_id,
          sub.isbn || null,
          sub.language || 'العربية',
          sub.cover_image || null,
        ]);

        // Send Student Approval Notification
        await client.query(`
          INSERT INTO notifications (
            id, recipient_id, recipient_role, title, message, type, target_tab, target_entity_id, is_read, created_at
          ) VALUES ($1, $2, 'student', $3, $4, 'book_approved', 'digital', $5, false, $6)
        `, [
          `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          sub.student_id,
          'تم اعتماد ونشر الكتاب المقترح',
          `تمت الموافقة على كتاب "${finalTitle}" وإضافته رسمياً للمستودع الرقمي المركزي بالمكتبة.`,
          bookId,
          reviewedAt,
        ]);

        resultMessage = `تم اعتماد كتاب "${finalTitle}" بنجاح وإضافته إلى المستودع الرقمي المركزي.`;
      }
    });

    await recordAuditLog(req.user!.id, req.user!.name, req.user!.role, 'REVIEW_SUBMISSION', 'submission', id, { status: normalizedActionStatus }, req);

    res.json({ success: true, data: { message: resultMessage } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'REVIEW_FAILED', message: err.message } });
  }
});

export default router;
