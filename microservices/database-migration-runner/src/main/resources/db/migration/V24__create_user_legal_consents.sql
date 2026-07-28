CREATE TABLE IF NOT EXISTS user_legal_consents (
                                                   id BIGSERIAL PRIMARY KEY,
                                                   user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_version VARCHAR(40) NOT NULL,
    privacy_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_source VARCHAR(40) NOT NULL DEFAULT 'MOBILE_APP',
    CONSTRAINT uq_user_legal_consent_version UNIQUE (user_id, consent_version)
    );

CREATE INDEX IF NOT EXISTS idx_user_legal_consents_user_id
    ON user_legal_consents(user_id);
