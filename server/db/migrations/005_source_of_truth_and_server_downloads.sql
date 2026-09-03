-- Migration 005: Source of Truth, Capability Classification & Server-Side Digital Downloads

-- 1. Extend pending_submissions with download URL and server storage metadata
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS download_url TEXT;
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS server_file_path TEXT;
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS server_file_size VARCHAR(50);
ALTER TABLE pending_submissions ADD COLUMN IF NOT EXISTS server_file_hash VARCHAR(100);

-- 2. Extend books table to record source portal and provenance fields if missing
ALTER TABLE books ADD COLUMN IF NOT EXISTS source_portal_id VARCHAR(50);
ALTER TABLE books ADD COLUMN IF NOT EXISTS source_record_id VARCHAR(100);
ALTER TABLE books ADD COLUMN IF NOT EXISTS source_record_url TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS download_url TEXT;

-- 3. Update built-in portals to reflect truthful STATIC_VERIFIED_SNAPSHOT classification
UPDATE whitelisted_portals
SET integration_method = 'STATIC_VERIFIED_SNAPSHOT',
    capabilities = '{"searchSupported":true,"recordLookupSupported":true,"canonicalUrlsSupported":true,"metadataSupported":true,"fullTextSupported":true,"verificationSupported":true}'::jsonb,
    discovery_details = jsonb_set(
      COALESCE(discovery_details, '{}'::jsonb),
      '{capabilityType}',
      '"STATIC_VERIFIED_SNAPSHOT"'::jsonb
    )
WHERE id IN ('portal-ibadi', 'portal-shamela', 'portal-arabic-academy', 'portal-school-research');
