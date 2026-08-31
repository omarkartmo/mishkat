import bcrypt from 'bcryptjs';
import { db } from './pool';
import {
  INITIAL_CATEGORIES,
  INITIAL_PHYSICAL_BOOKS,
  INITIAL_DIGITAL_BOOKS,
  INITIAL_STUDENTS,
  INITIAL_ADMIN,
  INITIAL_LOANS,
  INITIAL_WHITELISTED_PORTALS,
  INITIAL_SYSTEM_CONFIG,
  INITIAL_BOOK_SUMMARIES,
  INITIAL_STUDENT_NOTES,
} from '../../src/data/initialData';

export async function seedInitialData(): Promise<void> {
  // Check if roles exist
  const { rows: roles } = await db.query('SELECT id FROM roles LIMIT 1');
  if (roles.length === 0) {
    console.log('🌱 [Seeder] Seeding initial RBAC roles & permissions...');
    await db.query(`
      INSERT INTO roles (id, name, description) VALUES
      ('admin', 'أمين المكتبة العام (مدير النظام)', 'صلاحيات كاملة لإدارة المكتبة، الإعارات، الحسابات، والإعدادات'),
      ('librarian', 'مساعد أمين المكتبة', 'إدارة الإعارات ومطابقة الكتب وعمليات الجرد'),
      ('student', 'طالب / باحث', 'تصفح المكتبة، طلب استعارة، تدوين الملخصات والفوائد والمطالعة')
      ON CONFLICT (id) DO NOTHING;
    `);
  }

  // Check if Admin exists
  const { rows: adminRows } = await db.query('SELECT id FROM users WHERE registration_number = $1', [INITIAL_ADMIN.registrationNumber]);
  if (adminRows.length === 0) {
    console.log('🌱 [Seeder] Seeding initial admin and students accounts with secure password hashes...');
    const adminPassHash = await bcrypt.hash('admin123', 10);
    await db.query(`
      INSERT INTO users (id, registration_number, name, email, role_id, password_hash, plain_password, is_active, is_blocked)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, false)
      ON CONFLICT (registration_number) DO NOTHING;
    `, [
      INITIAL_ADMIN.id,
      INITIAL_ADMIN.registrationNumber,
      INITIAL_ADMIN.name,
      INITIAL_ADMIN.email || 'admin@mishkat.edu',
      'admin',
      adminPassHash,
      INITIAL_ADMIN.plainPassword || 'admin123',
    ]);

    // Seed Students
    for (const student of INITIAL_STUDENTS) {
      const studentPass = student.plainPassword || '123456';
      const studentPassHash = await bcrypt.hash(studentPass, 10);
      await db.query(`
        INSERT INTO users (id, registration_number, name, role_id, grade, password_hash, plain_password, is_active, is_blocked, is_blocked_from_borrowing)
        VALUES ($1, $2, $3, 'student', $4, $5, $6, true, false, false)
        ON CONFLICT (registration_number) DO NOTHING;
      `, [
        student.id,
        student.registrationNumber,
        student.name,
        student.grade || 'الصف العاشر',
        studentPassHash,
        studentPass,
      ]);
    }
  }

  // Categories
  const { rows: catRows } = await db.query('SELECT id FROM categories LIMIT 1');
  if (catRows.length === 0) {
    console.log('🌱 [Seeder] Seeding initial categories...');
    for (const cat of INITIAL_CATEGORIES) {
      await db.query(`
        INSERT INTO categories (id, name, name_en, description, color, icon_name)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING;
      `, [cat.id, cat.name, cat.nameEn || null, cat.description, cat.color, cat.iconName]);
    }
  }

  // Physical Books & Copies
  const { rows: pBookRows } = await db.query("SELECT id FROM books WHERE type = 'physical' LIMIT 1");
  if (pBookRows.length === 0) {
    console.log('🌱 [Seeder] Seeding initial physical books & inventory copies...');
    for (const book of INITIAL_PHYSICAL_BOOKS) {
      await db.query(`
        INSERT INTO books (
          id, type, title, author, publisher, publish_year, isbn, category_id,
          language, summary, pages_count, tags, cover_image,
          total_copies, available_copies, cabinet, shelf, section
        ) VALUES ($1, 'physical', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id) DO NOTHING;
      `, [
        book.id,
        book.title,
        book.author,
        book.publisher || null,
        book.publishYear || null,
        book.isbn || null,
        book.categoryId,
        book.language,
        book.summary,
        book.pages || 0,
        book.tags,
        book.coverImage || null,
        book.totalCopies,
        book.availableCopies,
        book.location?.cabinet || '',
        book.location?.shelf || '',
        book.location?.section || '',
      ]);

      // Create copies
      for (let i = 1; i <= book.totalCopies; i++) {
        const copyId = `copy-${book.id}-${i}`;
        const barcode = `BC-${book.id.toUpperCase()}-${String(i).padStart(2, '0')}`;
        await db.query(`
          INSERT INTO physical_copies (id, book_id, barcode, copy_number, cabinet, shelf, section, status, condition)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', 'good')
          ON CONFLICT (id) DO NOTHING;
        `, [
          copyId,
          book.id,
          barcode,
          i,
          book.location?.cabinet || '',
          book.location?.shelf || '',
          book.location?.section || '',
        ]);
      }
    }
  }

  // Digital Books
  const { rows: dBookRows } = await db.query("SELECT id FROM books WHERE type = 'digital' LIMIT 1");
  if (dBookRows.length === 0) {
    console.log('🌱 [Seeder] Seeding initial digital books & catalog...');
    for (const book of INITIAL_DIGITAL_BOOKS) {
      await db.query(`
        INSERT INTO books (
          id, type, title, author, category_id, format, file_size, file_url,
          pages_count, summary, cover_image, source_origin, uploaded_by, tags,
          download_count, read_count, table_of_contents, sample_content
        ) VALUES ($1, 'digital', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id) DO NOTHING;
      `, [
        book.id,
        book.title,
        book.author,
        book.categoryId,
        book.format,
        book.fileSize,
        book.fileUrl || null,
        book.pagesCount,
        book.summary,
        book.coverImage || null,
        book.sourceOrigin || null,
        book.uploadedBy || 'admin',
        book.tags,
        book.downloadCount,
        book.readCount,
        JSON.stringify(book.tableOfContents || []),
        JSON.stringify(book.sampleContent || []),
      ]);
    }
  }

  // Loans
  const { rows: loanRows } = await db.query('SELECT id FROM loans LIMIT 1');
  if (loanRows.length === 0) {
    console.log('🌱 [Seeder] Seeding initial circulation loan records...');
    for (const loan of INITIAL_LOANS) {
      await db.query(`
        INSERT INTO loans (
          id, book_id, book_title, student_id, student_name, student_reg_number,
          purpose, issue_date, due_date, return_date, status, extension_count, max_extensions_allowed, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO NOTHING;
      `, [
        loan.id,
        loan.bookId,
        loan.bookTitle,
        loan.studentId,
        loan.studentName,
        loan.studentRegNumber,
        loan.purpose,
        loan.issueDate,
        loan.dueDate,
        loan.returnDate || null,
        loan.status,
        loan.extensionCount,
        loan.maxExtensionsAllowed,
        loan.notes || null,
      ]);
    }
  }

  // Summaries
  const { rows: summaryRows } = await db.query('SELECT id FROM book_summaries LIMIT 1');
  if (summaryRows.length === 0) {
    console.log('🌱 [Seeder] Seeding initial book summaries...');
    for (const summary of INITIAL_BOOK_SUMMARIES) {
      await db.query(`
        INSERT INTO book_summaries (
          id, student_id, book_id, book_title, book_author, book_medium, title,
          structure_type, main_idea, key_takeaways, chapters_summaries,
          favorite_quotes, actionable_insights, tags, rating, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO NOTHING;
      `, [
        summary.id,
        summary.studentId,
        summary.bookId,
        summary.bookTitle,
        summary.bookAuthor,
        summary.bookMedium,
        summary.title,
        summary.structureType,
        summary.mainIdea,
        summary.keyTakeaways,
        JSON.stringify(summary.chaptersSummaries || []),
        JSON.stringify(summary.favoriteQuotes || []),
        summary.actionableInsights || [],
        summary.tags || [],
        summary.rating || 5,
        summary.createdAt,
      ]);
    }
  }

  // Student Notes
  const { rows: noteRows } = await db.query('SELECT id FROM student_notes LIMIT 1');
  if (noteRows.length === 0) {
    console.log('🌱 [Seeder] Seeding initial student notes...');
    for (const note of INITIAL_STUDENT_NOTES) {
      await db.query(`
        INSERT INTO student_notes (
          id, student_id, book_id, book_title, book_medium, page_number,
          chapter, quote, content, color_tag, category, tags, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO NOTHING;
      `, [
        note.id,
        note.studentId || 'stu-001',
        note.bookId,
        note.bookTitle,
        note.bookMedium || 'digital',
        note.pageNumber,
        note.chapter || null,
        note.quote || null,
        note.content,
        note.colorTag || 'amber',
        note.category || 'فائدة فقهية',
        note.tags || [],
        note.createdAt,
      ]);
    }
  }

  // Portals
  const { rows: portalRows } = await db.query('SELECT id FROM whitelisted_portals LIMIT 1');
  if (portalRows.length === 0) {
    console.log('🌱 [Seeder] Seeding initial academic portals...');
    for (const portal of INITIAL_WHITELISTED_PORTALS) {
      await db.query(`
        INSERT INTO whitelisted_portals (
          id, name, description, url, category, icon, is_featured, notes, allowed_domains
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING;
      `, [
        portal.id,
        portal.name,
        portal.description,
        portal.url,
        portal.category,
        portal.icon,
        portal.isFeatured,
        portal.notes || null,
        portal.allowedDomains,
      ]);
    }
  }

  // System Settings
  const { rows: configRows } = await db.query("SELECT key FROM system_settings WHERE key = 'library_config'");
  if (configRows.length === 0) {
    await db.query(`
      INSERT INTO system_settings (key, value)
      VALUES ('library_config', $1)
      ON CONFLICT (key) DO NOTHING;
    `, [JSON.stringify(INITIAL_SYSTEM_CONFIG)]);
  }

  console.log('🌟 [Seeder] Initial database seeding completed successfully.');
}
