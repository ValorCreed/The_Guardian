-- This column lets the Security Health Center detect old passwords accurately.

ALTER TABLE vault_items
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

UPDATE vault_items
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;
