-- Migration 014: Expand reading_progress and related table ID limits
-- Fixes "value too long for type character varying(50)" when student_id + book_id exceed 50 chars.

ALTER TABLE reading_progress ALTER COLUMN id TYPE VARCHAR(255);
ALTER TABLE reading_progress ALTER COLUMN student_id TYPE VARCHAR(255);
ALTER TABLE reading_progress ALTER COLUMN book_id TYPE VARCHAR(255);
ALTER TABLE reading_progress ALTER COLUMN last_read_at TYPE VARCHAR(100);

-- Also safeguard physical_bookmarks, student_notes, book_summaries, student_favorites
ALTER TABLE physical_bookmarks ALTER COLUMN id TYPE VARCHAR(255);
ALTER TABLE physical_bookmarks ALTER COLUMN student_id TYPE VARCHAR(255);
ALTER TABLE physical_bookmarks ALTER COLUMN book_id TYPE VARCHAR(255);

ALTER TABLE student_notes ALTER COLUMN id TYPE VARCHAR(255);
ALTER TABLE student_notes ALTER COLUMN student_id TYPE VARCHAR(255);
ALTER TABLE student_notes ALTER COLUMN book_id TYPE VARCHAR(255);

ALTER TABLE book_summaries ALTER COLUMN id TYPE VARCHAR(255);
ALTER TABLE book_summaries ALTER COLUMN student_id TYPE VARCHAR(255);
ALTER TABLE book_summaries ALTER COLUMN book_id TYPE VARCHAR(255);

ALTER TABLE student_favorites ALTER COLUMN id TYPE VARCHAR(255);
ALTER TABLE student_favorites ALTER COLUMN student_id TYPE VARCHAR(255);
ALTER TABLE student_favorites ALTER COLUMN book_id TYPE VARCHAR(255);
