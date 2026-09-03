-- Migration 004: Portal Discovery, Verification, Capabilities and Provenance

-- 1. Extend whitelisted_portals with discovery, integration, and capability fields
ALTER TABLE whitelisted_portals ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT';
ALTER TABLE whitelisted_portals ADD COLUMN IF NOT EXISTS integration_method VARCHAR(50) DEFAULT 'NONE';
ALTER TABLE whitelisted_portals ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{"searchSupported":false,"recordLookupSupported":false,"canonicalUrlsSupported":false,"metadataSupported":false,"fullTextSupported":false,"verificationSupported":false}'::jsonb;
ALTER TABLE whitelisted_portals ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE whitelisted_portals ADD COLUMN IF NOT EXISTS health_status VARCHAR(50) DEFAULT 'UNKNOWN';
ALTER TABLE whitelisted_portals ADD COLUMN IF NOT EXISTS discovery_details JSONB DEFAULT '{}'::jsonb;

-- 2. Extend pending_submissions with source provenance fields
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS source_portal_id VARCHAR(50);
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS source_record_id VARCHAR(100);
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS source_record_url TEXT;
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS source_method VARCHAR(50) DEFAULT 'OFFICIAL_CATALOG';
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS source_retrieved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'UNVERIFIED';

-- 3. Update existing seed portals to VERIFIED status with verified catalog integration
UPDATE whitelisted_portals
SET status = 'VERIFIED',
    integration_method = 'MANUAL_VERIFIED_CATALOG',
    capabilities = '{"searchSupported":true,"recordLookupSupported":true,"canonicalUrlsSupported":true,"metadataSupported":true,"fullTextSupported":true,"verificationSupported":true}'::jsonb,
    health_status = 'HEALTHY',
    last_verified_at = CURRENT_TIMESTAMP
WHERE status IS NULL OR status = 'DRAFT';
