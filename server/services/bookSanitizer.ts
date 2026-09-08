import { IDatabase } from '../db/pool';
import { isValidArabicSentence, synthesizeBookSummary } from '../utils/authorExtractor';
import { logger } from '../utils/logger';

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
