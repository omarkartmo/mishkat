-- Migration 013: Digital Book Print Requests
-- Enables students to request printing specific page ranges of digital library books
-- and provides librarians with an institutional management workflow.

CREATE TABLE IF NOT EXISTS print_requests (
    id VARCHAR(50) PRIMARY KEY,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE SET NULL,
    book_title VARCHAR(255) NOT NULL,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    student_name VARCHAR(255) NOT NULL,
    student_reg_number VARCHAR(100),
    page_from INTEGER NOT NULL,
    page_to INTEGER NOT NULL,
    total_pages INTEGER NOT NULL,
    purpose VARCHAR(100) DEFAULT 'بحث صفي',
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_print_requests_student_id ON print_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_print_requests_status ON print_requests(status);
CREATE INDEX IF NOT EXISTS idx_print_requests_created_at ON print_requests(created_at DESC);
