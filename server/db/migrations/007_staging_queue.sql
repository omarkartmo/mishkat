-- =========================================================
-- Migration 007: Staging Queue for Incoming Directory Watcher
-- Tracks files discovered via the incoming/ watcher, bulk upload,
-- or bulk scan that are pending admin review before import.
-- =========================================================

CREATE TABLE IF NOT EXISTS staging_queue (
  id                VARCHAR(50) PRIMARY KEY,
  original_filename VARCHAR(300) NOT NULL,
  staged_file_path  TEXT NOT NULL,
  source            VARCHAR(50) DEFAULT 'incoming_watcher',
  -- source: 'incoming_watcher' | 'bulk_upload' | 'bulk_scan' | 'manual_scan'
  format            VARCHAR(20) CHECK (format IN ('pdf', 'epub', NULL)),
  file_size_mb      NUMERIC(10,2),
  file_hash         VARCHAR(100),
  title             VARCHAR(300),
  author            VARCHAR(200),
  category_id       VARCHAR(50),
  confidence        INT DEFAULT 0,
  status            VARCHAR(50) DEFAULT 'PENDING_REVIEW',
  -- status: PENDING_REVIEW | IMPORTING | IMPORTED | REJECTED | DUPLICATE | ERROR
  duplicate_reason  TEXT,
  admin_notes       TEXT,
  queued_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reviewed_at       TIMESTAMP WITH TIME ZONE,
  reviewed_by       VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staging_queue_status ON staging_queue(status);
CREATE INDEX IF NOT EXISTS idx_staging_queue_file_hash ON staging_queue(file_hash);
CREATE INDEX IF NOT EXISTS idx_staging_queue_queued_at ON staging_queue(queued_at DESC);
