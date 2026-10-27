-- Migration 015: Support Outbound Queue Deduplication & Aggregation
-- Enables deduplication of identical error/problem reports, tracking total occurrence count and affected device IDs.

ALTER TABLE support_outbound_queue ADD COLUMN IF NOT EXISTS error_signature VARCHAR(64);
ALTER TABLE support_outbound_queue ADD COLUMN IF NOT EXISTS occurrence_count INT NOT NULL DEFAULT 1;
ALTER TABLE support_outbound_queue ADD COLUMN IF NOT EXISTS affected_devices_count INT NOT NULL DEFAULT 1;
ALTER TABLE support_outbound_queue ADD COLUMN IF NOT EXISTS affected_device_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE support_outbound_queue ADD COLUMN IF NOT EXISTS first_occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE support_outbound_queue ADD COLUMN IF NOT EXISTS last_occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_support_queue_signature_status ON support_outbound_queue(error_signature, status);
