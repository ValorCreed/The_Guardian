CREATE TABLE IF NOT EXISTS biometric_credentials (
                                                     id BIGSERIAL PRIMARY KEY,
                                                     user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    device_id_hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL
    );

CREATE INDEX IF NOT EXISTS idx_biometric_credentials_user_id
    ON biometric_credentials(user_id);

CREATE INDEX IF NOT EXISTS idx_biometric_credentials_user_device
    ON biometric_credentials(user_id, device_id_hash);

CREATE INDEX IF NOT EXISTS idx_biometric_credentials_active_token
    ON biometric_credentials(token_hash, revoked_at);
