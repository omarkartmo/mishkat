-- Migration 010: Client Telemetry, Support Agent, and Health Monitoring Schema

-- 1. Connected Student Installations
CREATE TABLE IF NOT EXISTS connected_clients (
    client_id VARCHAR(100) PRIMARY KEY,
    machine_name VARCHAR(150),
    app_version VARCHAR(50) NOT NULL,
    os_version VARCHAR(100),
    ip_address VARCHAR(50),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Client Telemetry & Diagnostic Events
CREATE TABLE IF NOT EXISTS client_telemetry_events (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(100) REFERENCES connected_clients(client_id) ON DELETE CASCADE,
    app_version VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'crash', 'react_error', 'pdf_render_error', 'epub_render_error', 'network_timeout', 'whitelist_blocked', 'manual_report'
    severity VARCHAR(20) NOT NULL,   -- 'critical', 'warning', 'info'
    error_code VARCHAR(100),
    message_sanitized TEXT NOT NULL,
    stack_trace_sanitized TEXT,
    route VARCHAR(200),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for high-performance diagnostic queries and aggregation
CREATE INDEX IF NOT EXISTS idx_telemetry_client_id ON client_telemetry_events(client_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON client_telemetry_events(event_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_severity ON client_telemetry_events(severity);
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON client_telemetry_events(created_at);
CREATE INDEX IF NOT EXISTS idx_connected_clients_last_seen ON connected_clients(last_seen_at);
