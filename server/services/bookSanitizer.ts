import fs from 'fs';
import path from 'path';
import { IDatabase } from '../db/pool';
import { isValidArabicSentence, synthesizeBookSummary } from '../utils/authorExtractor';
import { logger } from '../utils/logger';
import { serverConfig } from '../config';

/**
 * Reads the authentic, physical page count of a PDF file using pdfjs-dist
 */
export async function getPdfTruePageCount(filePath: string): Promise<number | null> {
  try {
    if (!fs.existsSync(filePath)) return null;
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const buffer = fs.readFileSync(filePath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    return doc.numPages;
  } catch (err: any) {
    logger.warn(`[BookSanitizer] Failed to read PDF page count from "${filePath}": ${err.message}`);
    return null;
  }
}

/**
 * Robustly resolves the real physical file on the server filesystem for any digital book record
 */
export async function findBookPdfFile(book: any): Promise<string | null> {
  if (book.file_path && fs.existsSync(book.file_path)) {
    return path.resolve(book.file_path);
  }

  const baseDirs = [
    serverConfig.dirs.digital,
    serverConfig.dirs.books,
    path.join(process.cwd(), 'LibraryData', 'books', 'digital'),
    path.join(process.cwd(), 'LibraryData', 'books'),
  ];

  const possibleNames: string[] = [];
  if (book.file_path) possibleNames.push(path.basename(book.file_path));
  if (book.file_url) {
    const raw = path.basename(book.file_url);
    try { possibleNames.push(decodeURIComponent(raw)); } catch {}
    possibleNames.push(raw);
  }
  if (book.title) {
    possibleNames.push(`${book.title}.pdf`);
    possibleNames.push(`${book.title.trim()}.pdf`);
  }
  if (book.id) {
    possibleNames.push(`${book.id}.pdf`);
  }

  for (const bDir of baseDirs) {
    if (!fs.existsSync(bDir)) continue;

    // Check direct file candidates in bDir
    for (const name of possibleNames) {
      const candidate = path.join(bDir, name);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return path.resolve(candidate);
      }
    }

    // Check subfolders inside bDir
    try {
      const subEntries = fs.readdirSync(bDir, { withFileTypes: true });
      for (const entry of subEntries) {
        if (!entry.isDirectory()) continue;
        const subDir = path.join(bDir, entry.name);

        for (const name of possibleNames) {
          const cand = path.join(subDir, name);
          if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
            return path.resolve(cand);
          }
        }

        // Match folder by book title prefix
        if (book.title && entry.name.trim().includes(book.title.trim().substring(0, 12))) {
          const innerFiles = fs.readdirSync(subDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
          if (innerFiles.length > 0) {
            return path.resolve(path.join(subDir, innerFiles[0]));
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Self-healing routine for digital book records in the central library database.
 * Scans all digital books and repairs any corrupt, hallucinated, reversed, or empty
 * summaries with authentic, grammatically correct Arabic descriptions based on title,
 * author, and category metadata.
 */
export async function healCorruptedDigitalBooks(db: IDatabase): Promise<number> {
  try {
    const { rows: books } = await db.query(`
      SELECT b.id, b.title, b.author, b.category_id, b.summary, c.name as category_name
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.type = 'digital'
    `);

    if (!books || books.length === 0) {
      return 0;
    }

    let healedCount = 0;

    for (const book of books) {
      const summaryText = (book.summary || '').trim();
      const isCoherent = summaryText.length >= 20 && isValidArabicSentence(summaryText);

      if (!isCoherent) {
        const cleanSummary = synthesizeBookSummary(book.title, book.author, book.category_name);
        await db.query(
          'UPDATE books SET summary = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [cleanSummary, book.id]
        );
        healedCount++;
      }
    }

    if (healedCount > 0) {
      console.log(`🧹 [BookSanitizer] Successfully healed and synthesized ${healedCount} digital book summaries.`);
    }

    return healedCount;
  } catch (err: any) {
    logger.warn(`[BookSanitizer] Error during digital book healing: ${err.message}`);
    return 0;
  }
}

/**
 * Self-healing and synchronization routine for digital book page counts.
 * Scans all digital books, inspects their actual physical PDF documents on disk,
 * and updates pages_count in PostgreSQL to match their authentic PDF page count.
 */
export async function healDigitalBookPageCounts(db: IDatabase): Promise<number> {
  try {
    const { rows: books } = await db.query(`
      SELECT id, title, author, file_path, file_url, format, pages_count
      FROM books
      WHERE type = 'digital'
    `);

    if (!books || books.length === 0) {
      return 0;
    }

    let updatedCount = 0;

    for (const book of books) {
      const format = (book.format || 'pdf').toLowerCase();
      if (format !== 'pdf') continue;

      const physicalPath = await findBookPdfFile(book);
      if (!physicalPath) continue;

      const truePages = await getPdfTruePageCount(physicalPath);
      if (truePages && truePages > 0 && truePages !== book.pages_count) {
        await db.query(
          'UPDATE books SET pages_count = $1, file_path = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [truePages, physicalPath, book.id]
        );
        updatedCount++;
        console.log(`📖 [BookSanitizer] Synchronized page count for "${book.title}": ${book.pages_count} -> ${truePages} pages.`);
      }
    }

    if (updatedCount > 0) {
      console.log(`✅ [BookSanitizer] Successfully synchronized ${updatedCount} digital book page counts to their true values.`);
    }

    return updatedCount;
  } catch (err: any) {
    logger.warn(`[BookSanitizer] Error during page count healing: ${err.message}`);
    return 0;
  }
}

