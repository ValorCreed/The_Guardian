ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verification_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS email_verification_code_expires_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS password_reset_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS password_reset_code_expires_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS two_factor_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS two_factor_code_expires_at TIMESTAMP;
