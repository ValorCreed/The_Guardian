ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS session_mode VARCHAR(16) NOT NULL DEFAULT 'NORMAL';

ALTER TABLE user_sessions
DROP CONSTRAINT IF EXISTS chk_user_sessions_session_mode;
ALTER TABLE user_sessions
    ADD CONSTRAINT chk_user_sessions_session_mode
        CHECK (session_mode IN ('NORMAL', 'DURESS'));

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_mode_active
    ON user_sessions(user_id, session_mode, active);

ALTER TABLE vault_items
    ADD COLUMN IF NOT EXISTS is_decoy BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cards
    ADD COLUMN IF NOT EXISTS is_decoy BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS is_decoy BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE secure_notes
    ADD COLUMN IF NOT EXISTS is_decoy BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_vault_items_user_decoy_updated
    ON vault_items(user_id, is_decoy, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_user_decoy_created
    ON cards(user_id, is_decoy, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_decoy_created
    ON documents(user_id, is_decoy, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_secure_notes_user_decoy_updated
    ON secure_notes(user_id, is_decoy, pinned DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS duress_profiles (
                                               user_id BIGINT PRIMARY KEY,
                                               duress_password_hash TEXT NOT NULL,
                                               enabled BOOLEAN NOT NULL DEFAULT TRUE,
                                               alert_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                                               alert_contact_user_id BIGINT,
                                               alert_contact_email VARCHAR(320),
    alert_contact_name VARCHAR(255),
    alert_delay_minutes INTEGER NOT NULL DEFAULT 15,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_duress_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_duress_profiles_alert_user
    FOREIGN KEY (alert_contact_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_duress_alert_delay
    CHECK (alert_delay_minutes IN (5, 15, 30, 60)),
    CONSTRAINT chk_duress_alert_contact
    CHECK (
              alert_enabled = FALSE OR
(alert_contact_user_id IS NOT NULL AND alert_contact_email IS NOT NULL)
    )
    );

CREATE TABLE IF NOT EXISTS duress_alerts (
                                             id BIGSERIAL PRIMARY KEY,
                                             user_id BIGINT NOT NULL,
                                             duress_session_token_id VARCHAR(80) NOT NULL UNIQUE,
    recipient_user_id BIGINT,
    recipient_email VARCHAR(320),
    recipient_name VARCHAR(255),
    status VARCHAR(16) NOT NULL,
    triggered_at TIMESTAMP NOT NULL,
    send_at TIMESTAMP NOT NULL,
    cancelled_at TIMESTAMP,
    sent_at TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_duress_alerts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_duress_alerts_recipient
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_duress_alert_status
    CHECK (status IN ('PENDING', 'CANCELLED', 'SENT'))
    );

CREATE UNIQUE INDEX IF NOT EXISTS uk_duress_alerts_one_pending_per_user
    ON duress_alerts(user_id)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_duress_alerts_due
    ON duress_alerts(status, send_at);
CREATE INDEX IF NOT EXISTS idx_duress_alerts_user_created
    ON duress_alerts(user_id, triggered_at DESC);
