-- Migration 011: Outbound Support Queue for Reliable Delivery to Developer Support Hub
-- Enables offline persistence, idempotent retry backoff, and diagnostic report aggregation.

CREATE TABLE IF NOT EXISTS support_outbound_queue (
    report_id VARCHAR(100) PRIMARY KEY,
    institution_id VARCHAR(100) NOT NULL,
    installation_id VARCHAR(100) NOT NULL,
    app_version VARCHAR(50) NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'server', -- 'client' or 'server'
    client_device_id VARCHAR(100),
    user_role VARCHAR(50) DEFAULT 'system',
    component VARCHAR(100) NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    error_code VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning', -- 'critical', 'warning', 'info'
    sanitized_message TEXT NOT NULL,
    sanitized_stack_trace TEXT,
    diagnostic_context JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- 'pending', 'sending', 'sent', 'failed'
    attempts_count INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_queue_status_retry ON support_outbound_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_support_queue_created_at ON support_outbound_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_support_queue_institution ON support_outbound_queue(institution_id);
