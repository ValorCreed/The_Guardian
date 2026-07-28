CREATE TABLE IF NOT EXISTS pending_registrations (
                                                     id BIGSERIAL PRIMARY KEY,
                                                     full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash TEXT NOT NULL,
    verification_code_hash TEXT NOT NULL,
    verification_code_expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_pending_registration_email UNIQUE (email)
    );

CREATE INDEX IF NOT EXISTS idx_pending_registration_code_expiry
    ON pending_registrations (verification_code_expires_at);
