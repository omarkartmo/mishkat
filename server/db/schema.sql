-- =========================================================
-- MISHKAT CENTRAL LIBRARY SYSTEM - DATABASE SCHEMA (PostgreSQL)
-- Single Source of Truth for Library Central Server
-- =========================================================

-- 1. Schema Migrations Log
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Roles & Permissions (RBAC)
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id VARCHAR(50) REFERENCES roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(100) REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 3. Users Table (Librarian, Admins, Students)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE,
    registration_number VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    role_id VARCHAR(50) REFERENCES roles(id) DEFAULT 'student',
    grade VARCHAR(100),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_blocked BOOLEAN DEFAULT FALSE,
    is_blocked_from_borrowing BOOLEAN DEFAULT FALSE,
    block_reason TEXT,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_reg_number ON users(registration_number);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_grade ON users(grade);

-- 4. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    name_en VARCHAR(150),
    description TEXT,
    color VARCHAR(50) DEFAULT '#4f46e5',
    icon_name VARCHAR(50) DEFAULT 'BookOpen',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Master Books Table (Physical & Digital)
CREATE TABLE IF NOT EXISTS books (
    id VARCHAR(50) PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('physical', 'digital')),
    title VARCHAR(300) NOT NULL,
    subtitle VARCHAR(300),
    author VARCHAR(200) NOT NULL,
    publisher VARCHAR(200),
    publish_year INT,
    isbn VARCHAR(50),
    category_id VARCHAR(50) REFERENCES categories(id) ON DELETE SET NULL,
    language VARCHAR(50) DEFAULT 'العربية',
    summary TEXT,
    pages_count INT DEFAULT 0,
    tags TEXT[], -- Array of topic tags
    cover_image TEXT,
    
    -- Digital Book Specific Fields
    format VARCHAR(20) CHECK (format IN ('pdf', 'epub')),
    file_size VARCHAR(50),
    file_path TEXT,
    file_url TEXT,
    file_hash VARCHAR(100),
    source_origin VARCHAR(200),
    uploaded_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    download_count INT DEFAULT 0,
    read_count INT DEFAULT 0,
    table_of_contents JSONB,
    sample_content JSONB,
    
    -- Physical Book Specific Fields
    total_copies INT DEFAULT 1,
    available_copies INT DEFAULT 1,
    cabinet VARCHAR(100),
    shelf VARCHAR(100),
    section VARCHAR(100),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_books_type ON books(type);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);

-- 6. Physical Book Copies
CREATE TABLE IF NOT EXISTS physical_copies (
    id VARCHAR(50) PRIMARY KEY,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE CASCADE,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    copy_number INT DEFAULT 1,
    cabinet VARCHAR(100),
    shelf VARCHAR(100),
    section VARCHAR(100),
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'borrowed', 'maintenance', 'lost', 'reserved')),
    condition VARCHAR(50) DEFAULT 'good',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_copies_book ON physical_copies(book_id);
CREATE INDEX IF NOT EXISTS idx_copies_barcode ON physical_copies(barcode);
CREATE INDEX IF NOT EXISTS idx_copies_status ON physical_copies(status);

-- 7. Loans Table (Active and Historical circulation records)
CREATE TABLE IF NOT EXISTS loans (
    id VARCHAR(50) PRIMARY KEY,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE RESTRICT,
    book_title VARCHAR(300) NOT NULL,
    copy_id VARCHAR(50) REFERENCES physical_copies(id) ON DELETE SET NULL,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE RESTRICT,
    student_name VARCHAR(200) NOT NULL,
    student_reg_number VARCHAR(100) NOT NULL,
    purpose VARCHAR(50) DEFAULT 'general_reading' CHECK (purpose IN ('general_reading', 'academic_research')),
    issue_date VARCHAR(50) NOT NULL,
    due_date VARCHAR(50) NOT NULL,
    return_date VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'extended', 'returned', 'overdue')),
    extension_count INT DEFAULT 0,
    max_extensions_allowed INT DEFAULT 1,
    notes TEXT,
    is_override_exemption BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    issued_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    returned_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loans_student ON loans(student_id);
CREATE INDEX IF NOT EXISTS idx_loans_book ON loans(book_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_due_date ON loans(due_date);

-- 8. Physical Loan Requests (from students)
CREATE TABLE IF NOT EXISTS loan_requests (
    id VARCHAR(50) PRIMARY KEY,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE CASCADE,
    book_title VARCHAR(300) NOT NULL,
    book_author VARCHAR(200),
    cabinet VARCHAR(100),
    shelf VARCHAR(100),
    section VARCHAR(100),
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    student_name VARCHAR(200) NOT NULL,
    student_reg_number VARCHAR(100) NOT NULL,
    student_grade VARCHAR(100),
    purpose VARCHAR(100) NOT NULL,
    custom_reason TEXT,
    requested_duration_days INT DEFAULT 7,
    requested_at VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'handed_over', 'rejected', 'cancelled')),
    approved_duration_days INT,
    approved_at VARCHAR(50),
    due_date_calculated VARCHAR(50),
    admin_notes TEXT,
    rejection_reason TEXT,
    handed_over_at VARCHAR(50),
    loan_record_id VARCHAR(50) REFERENCES loans(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_requests_student ON loan_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON loan_requests(status);

-- 9. Reading Progress (Digital Books & in-app reading)
CREATE TABLE IF NOT EXISTS reading_progress (
    id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE CASCADE,
    current_page INT NOT NULL DEFAULT 1,
    total_pages INT NOT NULL DEFAULT 1,
    percentage INT NOT NULL DEFAULT 0,
    last_read_at VARCHAR(50) NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_student ON reading_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_book ON reading_progress(book_id);

-- 10. Physical Bookmarks (Physical books bookmarking & session notes)
CREATE TABLE IF NOT EXISTS physical_bookmarks (
    id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE CASCADE,
    book_title VARCHAR(300) NOT NULL,
    book_author VARCHAR(200),
    cabinet VARCHAR(100),
    shelf VARCHAR(100),
    section VARCHAR(100),
    current_page INT NOT NULL DEFAULT 1,
    total_pages INT NOT NULL DEFAULT 1,
    chapter_or_topic VARCHAR(200),
    last_session_date VARCHAR(50) NOT NULL,
    quick_note TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_student ON physical_bookmarks(student_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON physical_bookmarks(book_id);

-- 11. Book Summaries (Creative and structured multi-format summaries)
CREATE TABLE IF NOT EXISTS book_summaries (
    id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE CASCADE,
    book_title VARCHAR(300) NOT NULL,
    book_author VARCHAR(200) NOT NULL,
    book_medium VARCHAR(20) NOT NULL CHECK (book_medium IN ('physical', 'digital')),
    title VARCHAR(300) NOT NULL,
    structure_type VARCHAR(50) NOT NULL,
    main_idea TEXT NOT NULL,
    key_takeaways TEXT[],
    chapters_summaries JSONB,
    favorite_quotes JSONB,
    actionable_insights TEXT[],
    tags TEXT[],
    rating INT DEFAULT 5,
    created_at VARCHAR(50) NOT NULL,
    updated_at VARCHAR(50),
    created_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_summaries_student ON book_summaries(student_id);
CREATE INDEX IF NOT EXISTS idx_summaries_book ON book_summaries(book_id);

-- 12. Student Notes & Annotations
CREATE TABLE IF NOT EXISTS student_notes (
    id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE CASCADE,
    book_title VARCHAR(300) NOT NULL,
    book_medium VARCHAR(20) DEFAULT 'digital' CHECK (book_medium IN ('physical', 'digital')),
    page_number INT DEFAULT 1,
    chapter VARCHAR(200),
    quote TEXT,
    content TEXT NOT NULL,
    color_tag VARCHAR(50) DEFAULT 'amber',
    category VARCHAR(100) DEFAULT 'فائدة فقهية',
    tags TEXT[],
    created_at VARCHAR(50) NOT NULL,
    created_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_student ON student_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_notes_book ON student_notes(book_id);

-- 13. Student Favorites
CREATE TABLE IF NOT EXISTS student_favorites (
    id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_student ON student_favorites(student_id);

-- 14. Pending Book Submissions (Student eBook uploads queue for review)
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
    source_portal_id VARCHAR(50),
    source_record_id VARCHAR(100),
    source_record_url TEXT,
    source_method VARCHAR(50) DEFAULT 'OFFICIAL_CATALOG',
    source_retrieved_at TIMESTAMP WITH TIME ZONE,
    verification_status VARCHAR(50) DEFAULT 'UNVERIFIED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON pending_submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON pending_submissions(student_id);

-- 15. Whitelisted Academic Portals
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
    status VARCHAR(50) DEFAULT 'DRAFT',
    integration_method VARCHAR(50) DEFAULT 'NONE',
    capabilities JSONB DEFAULT '{"searchSupported":false,"recordLookupSupported":false,"canonicalUrlsSupported":false,"metadataSupported":false,"fullTextSupported":false,"verificationSupported":false}'::jsonb,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(50) DEFAULT 'UNKNOWN',
    discovery_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. App Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(50) PRIMARY KEY,
    recipient_id VARCHAR(50) NOT NULL, -- user_id or 'admin' or 'all'
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

CREATE INDEX IF NOT EXISTS idx_notifs_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifs_read ON notifications(is_read);

-- 17. System Settings (Key-Value configuration for library policies)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 18. Audit Logs (Mandatory for all critical operations)
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

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
