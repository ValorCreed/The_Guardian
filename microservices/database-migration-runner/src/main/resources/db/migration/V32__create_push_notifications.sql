CREATE TABLE IF NOT EXISTS push_tokens (
                                           id BIGSERIAL PRIMARY KEY,
                                           user_id BIGINT NOT NULL,
                                           installation_id VARCHAR(160) NOT NULL,
    expo_push_token VARCHAR(255) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    device_name VARCHAR(180) NOT NULL,
    app_version VARCHAR(60),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_push_tokens_expo_token UNIQUE (expo_push_token),
    CONSTRAINT uk_push_tokens_user_installation UNIQUE (user_id, installation_id)
    );

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_enabled
    ON push_tokens(user_id, enabled);

CREATE TABLE IF NOT EXISTS notification_preferences (
                                                        user_id BIGINT PRIMARY KEY,
                                                        push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                                                        security_alerts BOOLEAN NOT NULL DEFAULT TRUE,
                                                        emergency_recovery BOOLEAN NOT NULL DEFAULT TRUE,
                                                        continuity_reminders BOOLEAN NOT NULL DEFAULT TRUE,
                                                        billing BOOLEAN NOT NULL DEFAULT TRUE,
                                                        product_updates BOOLEAN NOT NULL DEFAULT FALSE,
                                                        updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS push_delivery_attempts (
                                                      id BIGSERIAL PRIMARY KEY,
                                                      notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    push_token_id BIGINT NOT NULL REFERENCES push_tokens(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    urgency VARCHAR(24) NOT NULL,
    channel_id VARCHAR(80) NOT NULL,
    push_title VARCHAR(255) NOT NULL,
    push_body VARCHAR(600) NOT NULL,
    action_route VARCHAR(255),
    notification_type VARCHAR(80) NOT NULL,
    expo_ticket_id VARCHAR(180),
    error_code VARCHAR(120),
    error_message VARCHAR(1200),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP NOT NULL,
    sent_at TIMESTAMP,
    receipt_checked_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_push_delivery_notification_token
    UNIQUE (notification_id, push_token_id)
    );

CREATE INDEX IF NOT EXISTS idx_push_delivery_due
    ON push_delivery_attempts(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_push_delivery_ticket
    ON push_delivery_attempts(expo_ticket_id);
