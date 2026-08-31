-- Migration 002: Circulation, Copies, Requests, Summaries, Notes, Progress
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

CREATE TABLE IF NOT EXISTS student_favorites (
    id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    book_id VARCHAR(50) REFERENCES books(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, book_id)
);
