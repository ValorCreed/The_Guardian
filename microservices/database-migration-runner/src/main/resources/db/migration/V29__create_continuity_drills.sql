CREATE TABLE IF NOT EXISTS continuity_drills (
                                                 id BIGSERIAL PRIMARY KEY,
                                                 public_id VARCHAR(40) NOT NULL UNIQUE,
    owner_id BIGINT NOT NULL,
    owner_name_snapshot VARCHAR(255) NOT NULL,
    owner_email_snapshot VARCHAR(255) NOT NULL,
    plan_snapshot VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    static_score INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT fk_continuity_drills_owner
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT ck_continuity_drills_status
    CHECK (status IN ('RUNNING', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
    CONSTRAINT ck_continuity_drills_score
    CHECK (score BETWEEN 0 AND 100),
    CONSTRAINT ck_continuity_drills_static_score
    CHECK (static_score BETWEEN 0 AND 70),
    CONSTRAINT ck_continuity_drills_dates
    CHECK (expires_at > started_at)
    );

CREATE UNIQUE INDEX IF NOT EXISTS uk_continuity_drills_running_owner
    ON continuity_drills(owner_id)
    WHERE status = 'RUNNING';

CREATE INDEX IF NOT EXISTS idx_continuity_drills_owner_history
    ON continuity_drills(owner_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_continuity_drills_expiry
    ON continuity_drills(status, expires_at)
    WHERE status = 'RUNNING';

CREATE TABLE IF NOT EXISTS continuity_drill_checks (
                                                       id BIGSERIAL PRIMARY KEY,
                                                       drill_id BIGINT NOT NULL,
                                                       check_code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(10) NOT NULL,
    detail TEXT NOT NULL,
    action_route VARCHAR(255),
    weight INTEGER NOT NULL,
    earned_points INTEGER NOT NULL,
    display_order INTEGER NOT NULL,

    CONSTRAINT fk_continuity_drill_checks_drill
    FOREIGN KEY (drill_id) REFERENCES continuity_drills(id) ON DELETE CASCADE,
    CONSTRAINT uk_continuity_drill_check
    UNIQUE (drill_id, check_code),
    CONSTRAINT ck_continuity_drill_check_status
    CHECK (status IN ('PASS', 'WARN', 'FAIL')),
    CONSTRAINT ck_continuity_drill_check_weight
    CHECK (weight BETWEEN 1 AND 100),
    CONSTRAINT ck_continuity_drill_check_points
    CHECK (earned_points BETWEEN 0 AND weight)
    );

CREATE INDEX IF NOT EXISTS idx_continuity_drill_checks_drill
    ON continuity_drill_checks(drill_id, display_order);

CREATE TABLE IF NOT EXISTS continuity_drill_participants (
                                                             id BIGSERIAL PRIMARY KEY,
                                                             drill_id BIGINT NOT NULL,
                                                             participant_user_id BIGINT,
                                                             participant_name_snapshot VARCHAR(255) NOT NULL,
    participant_email_snapshot VARCHAR(255) NOT NULL,
    roles_snapshot VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    notified_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT fk_continuity_drill_participants_drill
    FOREIGN KEY (drill_id) REFERENCES continuity_drills(id) ON DELETE CASCADE,
    CONSTRAINT fk_continuity_drill_participants_user
    FOREIGN KEY (participant_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uk_continuity_drill_participant
    UNIQUE (drill_id, participant_user_id),
    CONSTRAINT ck_continuity_drill_participant_status
    CHECK (status IN ('PENDING', 'ACKNOWLEDGED')),
    CONSTRAINT ck_continuity_drill_ack_time
    CHECK (
(status = 'PENDING' AND acknowledged_at IS NULL)
    OR
(status = 'ACKNOWLEDGED' AND acknowledged_at IS NOT NULL)
    )
    );

CREATE INDEX IF NOT EXISTS idx_continuity_drill_participants_user
    ON continuity_drill_participants(participant_user_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_continuity_drill_participants_drill
    ON continuity_drill_participants(drill_id, status);
