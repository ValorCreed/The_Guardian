CREATE TABLE IF NOT EXISTS bug_reports (
                                           id BIGSERIAL PRIMARY KEY,
                                           user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(140) NOT NULL,
    category VARCHAR(60) NOT NULL,
    severity VARCHAR(30) NOT NULL,
    description TEXT NOT NULL,
    steps_to_reproduce TEXT,
    include_diagnostics BOOLEAN NOT NULL DEFAULT FALSE,
    device_info TEXT,
    app_version VARCHAR(80),
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC);
