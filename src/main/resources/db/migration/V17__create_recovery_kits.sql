CREATE TABLE IF NOT EXISTS recovery_kits (
                                             id BIGSERIAL PRIMARY KEY,
                                             user_id BIGINT NOT NULL,
                                             recovery_id VARCHAR(80) NOT NULL UNIQUE,
    recovery_key_hash VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    CONSTRAINT fk_recovery_kits_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_recovery_kits_user_active
    ON recovery_kits(user_id, active);

CREATE INDEX IF NOT EXISTS idx_recovery_kits_recovery_id_active
    ON recovery_kits(recovery_id, active);
