ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS device_id_hash VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_device_hash
    ON user_sessions(user_id, device_id_hash);

-- Existing active rows were created before the app sent a stable device ID.
-- Deactivate them so free users are not permanently blocked by old IP-based sessions.
UPDATE user_sessions
SET active = false,
    revoked_at = CURRENT_TIMESTAMP
WHERE device_id_hash IS NULL
  AND active = true;
