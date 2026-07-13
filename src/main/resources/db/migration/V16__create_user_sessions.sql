CREATE TABLE IF NOT EXISTS user_sessions (
                                             id BIGSERIAL PRIMARY KEY,
                                             token_id VARCHAR(80) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(80) NOT NULL,
    user_agent VARCHAR(1200),
    ip_address VARCHAR(255),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP,
    last_seen_at TIMESTAMP,
    revoked_at TIMESTAMP,
    CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_user_sessions_token_id ON user_sessions(token_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
