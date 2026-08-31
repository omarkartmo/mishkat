-- Migration 001: Initial Core Schema
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE,
    registration_number VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    plain_password VARCHAR(255),
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
    tags TEXT[],
    cover_image TEXT,
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
    total_copies INT DEFAULT 1,
    available_copies INT DEFAULT 1,
    cabinet VARCHAR(100),
    shelf VARCHAR(100),
    section VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
