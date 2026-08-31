-- Migration 003: Portals, Submissions, Settings, Notifications, Audit Logs
CREATE TABLE IF NOT EXISTS pending_submissions (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    author VARCHAR(200) NOT NULL,
    suggested_category_id VARCHAR(50) REFERENCES categories(id) ON DELETE SET NULL,
    format VARCHAR(20) DEFAULT 'pdf',
    source_url TEXT,
    source_portal_name VARCHAR(200) NOT NULL,
    summary TEXT,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    student_name VARCHAR(200) NOT NULL,
    student_reg_number VARCHAR(100) NOT NULL,
    submitted_at VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_feedback TEXT,
    reviewed_at VARCHAR(50),
    reviewed_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    temp_file_url TEXT,
    pages_estimated INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whitelisted_portals (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    icon VARCHAR(50) DEFAULT 'Globe',
    is_featured BOOLEAN DEFAULT TRUE,
    notes TEXT,
    allowed_domains TEXT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(50) PRIMARY KEY,
    recipient_id VARCHAR(50) NOT NULL,
    recipient_role VARCHAR(50),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(100) NOT NULL,
    target_tab VARCHAR(100) NOT NULL,
    target_entity_id VARCHAR(100),
    is_read BOOLEAN DEFAULT FALSE,
    created_at VARCHAR(50) NOT NULL,
    created_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50),
    user_name VARCHAR(200),
    user_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    metadata JSONB,
    ip_address VARCHAR(100),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for optimal lookup performance
CREATE INDEX IF NOT EXISTS idx_users_reg_number ON users(registration_number);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_books_type ON books(type);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id);
CREATE INDEX IF NOT EXISTS idx_copies_book ON physical_copies(book_id);
CREATE INDEX IF NOT EXISTS idx_loans_student ON loans(student_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_requests_student ON loan_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON loan_requests(status);
CREATE INDEX IF NOT EXISTS idx_progress_student ON reading_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_student ON physical_bookmarks(student_id);
CREATE INDEX IF NOT EXISTS idx_summaries_student ON book_summaries(student_id);
CREATE INDEX IF NOT EXISTS idx_notes_student ON student_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_favorites_student ON student_favorites(student_id);
CREATE INDEX IF NOT EXISTS idx_notifs_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
