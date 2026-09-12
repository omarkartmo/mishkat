-- Migration 009: Add token_version to users for session revocation
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1;
