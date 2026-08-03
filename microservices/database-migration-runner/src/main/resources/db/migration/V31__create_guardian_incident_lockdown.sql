CREATE TABLE IF NOT EXISTS security_incidents (
                                                  id BIGSERIAL PRIMARY KEY,
                                                  public_id VARCHAR(64) NOT NULL UNIQUE,
    owner_id BIGINT NOT NULL,
    type VARCHAR(40) NOT NULL,
    status VARCHAR(16) NOT NULL,
    plan_snapshot VARCHAR(16) NOT NULL,
    safe_session_token_id VARCHAR(80) NOT NULL,
    safe_device_id_hash VARCHAR(128),
    safe_device_name VARCHAR(255),
    user_note TEXT,
    progress INTEGER NOT NULL DEFAULT 0,
    sessions_revoked INTEGER NOT NULL DEFAULT 0,
    biometrics_revoked INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_security_incidents_owner
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_security_incident_type
    CHECK (type IN (
           'LOST_OR_STOLEN_DEVICE',
           'MASTER_PASSWORD_EXPOSED',
           'EMAIL_COMPROMISED',
           'PHISHING_ATTACK',
           'UNKNOWN_LOGIN',
           'SIM_SWAP',
           'FAMILY_MISUSE',
           'DURESS_EVENT_ENDED',
           'OTHER'
                   )),
    CONSTRAINT chk_security_incident_status
    CHECK (status IN ('ACTIVE', 'COMPLETED', 'RECOVERED', 'CANCELLED')),
    CONSTRAINT chk_security_incident_progress
    CHECK (progress BETWEEN 0 AND 100)
    );

CREATE UNIQUE INDEX IF NOT EXISTS uk_security_incidents_one_active_owner
    ON security_incidents(owner_id)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_security_incidents_owner_started
    ON security_incidents(owner_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_incidents_status
    ON security_incidents(status);

CREATE TABLE IF NOT EXISTS incident_recovery_tasks (
                                                       id BIGSERIAL PRIMARY KEY,
                                                       incident_id BIGINT NOT NULL,
                                                       task_code VARCHAR(96) NOT NULL,
    title VARCHAR(255) NOT NULL,
    detail TEXT NOT NULL,
    action_route VARCHAR(255),
    required BOOLEAN NOT NULL DEFAULT FALSE,
    priority INTEGER NOT NULL DEFAULT 50,
    display_order INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
    completed_at TIMESTAMP,
    CONSTRAINT fk_incident_tasks_incident
    FOREIGN KEY (incident_id) REFERENCES security_incidents(id) ON DELETE CASCADE,
    CONSTRAINT uk_incident_task_code UNIQUE (incident_id, task_code),
    CONSTRAINT chk_incident_task_status
    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
    CONSTRAINT chk_incident_task_priority
    CHECK (priority BETWEEN 1 AND 100)
    );

CREATE INDEX IF NOT EXISTS idx_incident_tasks_incident_order
    ON incident_recovery_tasks(incident_id, display_order);

CREATE INDEX IF NOT EXISTS idx_incident_tasks_incident_status
    ON incident_recovery_tasks(incident_id, status);

CREATE TABLE IF NOT EXISTS incident_timeline_events (
                                                        id BIGSERIAL PRIMARY KEY,
                                                        incident_id BIGINT NOT NULL,
                                                        event_type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    detail TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_incident_timeline_incident
    FOREIGN KEY (incident_id) REFERENCES security_incidents(id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident_created
    ON incident_timeline_events(incident_id, created_at DESC);
