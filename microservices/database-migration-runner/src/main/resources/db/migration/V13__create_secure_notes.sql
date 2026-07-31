CREATE TABLE IF NOT EXISTS secure_notes (
                                            id BIGSERIAL PRIMARY KEY,
                                            title VARCHAR(255) NOT NULL,
    category VARCHAR(255),
    encrypted_content TEXT NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    user_id BIGINT,
    CONSTRAINT fk_secure_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_secure_notes_user_id ON secure_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_secure_notes_user_pinned_updated ON secure_notes(user_id, pinned, updated_at);
