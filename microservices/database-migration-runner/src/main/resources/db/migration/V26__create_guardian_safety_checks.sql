CREATE TABLE IF NOT EXISTS guardian_safety_checks (
                                                      id BIGSERIAL PRIMARY KEY,
                                                      owner_id BIGINT NOT NULL,
                                                      contact_id BIGINT NOT NULL,
                                                      interval_days INTEGER NOT NULL,
                                                      grace_period_hours INTEGER NOT NULL,
                                                      status VARCHAR(30) NOT NULL,
    last_check_in_at TIMESTAMPTZ,
    next_check_in_at TIMESTAMPTZ,
    grace_started_at TIMESTAMPTZ,
    triggered_at TIMESTAMPTZ,
    triggered_request_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT uk_guardian_safety_checks_owner UNIQUE (owner_id),
    CONSTRAINT fk_guardian_safety_checks_owner
    FOREIGN KEY (owner_id)
    REFERENCES users(id)
    ON DELETE CASCADE,
    CONSTRAINT fk_guardian_safety_checks_contact
    FOREIGN KEY (contact_id)
    REFERENCES emergency_contacts(id)
    ON DELETE CASCADE,
    CONSTRAINT fk_guardian_safety_checks_triggered_request
    FOREIGN KEY (triggered_request_id)
    REFERENCES emergency_access_requests(id)
    ON DELETE SET NULL,
    CONSTRAINT ck_guardian_safety_checks_interval
    CHECK (interval_days IN (1, 3, 7, 14, 30)),
    CONSTRAINT ck_guardian_safety_checks_grace
    CHECK (grace_period_hours IN (12, 24, 48, 72)),
    CONSTRAINT ck_guardian_safety_checks_status
    CHECK (status IN ('DISABLED', 'ACTIVE', 'GRACE', 'TRIGGERED'))
    );

CREATE INDEX IF NOT EXISTS idx_guardian_safety_checks_due
    ON guardian_safety_checks(status, next_check_in_at);

CREATE INDEX IF NOT EXISTS idx_guardian_safety_checks_grace
    ON guardian_safety_checks(status, grace_started_at);
