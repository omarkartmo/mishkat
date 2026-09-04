-- Migration 006: Suggestion State Machine, Metadata Fields, and Digital Storage

-- 1. Relax or drop existing check constraint on pending_submissions status
ALTER TABLE pending_submissions DROP CONSTRAINT IF EXISTS pending_submissions_status_check;

ALTER TABLE pending_submissions ADD CONSTRAINT pending_submissions_status_check
CHECK (status IN (
  'pending', 'approved', 'rejected',
  'PENDING_REVIEW', 'NEEDS_MANUAL_ACQUISITION', 'READY_FOR_FINAL_APPROVAL', 'APPROVED', 'REJECTED'
));

-- 2. Add optional metadata fields to pending_submissions
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS isbn VARCHAR(50);
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS language VARCHAR(50);
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- 3. Ensure books table has file_path, file_hash, and digital metadata
ALTER TABLE books ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS file_hash VARCHAR(100);

-- 4. Create staging index
CREATE INDEX IF NOT EXISTS idx_submissions_status_state ON pending_submissions(status);
