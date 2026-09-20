CREATE TABLE IF NOT EXISTS blocked_categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocked_sites (
    id VARCHAR(50) PRIMARY KEY,
    domain VARCHAR(255) NOT NULL UNIQUE,
    category_id VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    added_by VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES blocked_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_blocked_sites_domain ON blocked_sites(domain);
