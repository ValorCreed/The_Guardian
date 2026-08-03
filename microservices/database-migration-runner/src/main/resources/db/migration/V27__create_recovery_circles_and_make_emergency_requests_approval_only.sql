ALTER TABLE emergency_access_requests
    ALTER COLUMN available_at DROP NOT NULL;

CREATE TABLE IF NOT EXISTS recovery_circles (
                                                id BIGSERIAL PRIMARY KEY,
                                                owner_id BIGINT NOT NULL UNIQUE,
                                                approval_threshold INTEGER NOT NULL,
                                                recovery_code_hash VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_recovery_circles_owner
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_recovery_circle_threshold
    CHECK (approval_threshold BETWEEN 2 AND 5)
    );

CREATE TABLE IF NOT EXISTS recovery_circle_members (
                                                       id BIGSERIAL PRIMARY KEY,
                                                       circle_id BIGINT NOT NULL,
                                                       member_user_id BIGINT NOT NULL,
                                                       member_email VARCHAR(255) NOT NULL,
    member_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_recovery_circle_members_circle
    FOREIGN KEY (circle_id) REFERENCES recovery_circles(id) ON DELETE CASCADE,
    CONSTRAINT fk_recovery_circle_members_user
    FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_recovery_circle_member UNIQUE (circle_id, member_user_id)
    );

CREATE INDEX IF NOT EXISTS idx_recovery_circle_members_user
    ON recovery_circle_members(member_user_id);

CREATE TABLE IF NOT EXISTS recovery_circle_requests (
                                                        id BIGSERIAL PRIMARY KEY,
                                                        circle_id BIGINT NOT NULL,
                                                        owner_id BIGINT NOT NULL,
                                                        public_id VARCHAR(40) NOT NULL UNIQUE,
    recovery_code_hash VARCHAR(255) NOT NULL,
    status VARCHAR(40) NOT NULL,
    approval_count INTEGER NOT NULL DEFAULT 0,
    denial_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    approved_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    CONSTRAINT fk_recovery_circle_requests_circle
    FOREIGN KEY (circle_id) REFERENCES recovery_circles(id) ON DELETE CASCADE,
    CONSTRAINT fk_recovery_circle_requests_owner
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_recovery_circle_requests_owner
    ON recovery_circle_requests(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_circle_requests_status
    ON recovery_circle_requests(status, expires_at);

CREATE TABLE IF NOT EXISTS recovery_circle_votes (
                                                     id BIGSERIAL PRIMARY KEY,
                                                     request_id BIGINT NOT NULL,
                                                     member_user_id BIGINT NOT NULL,
                                                     decision VARCHAR(20) NOT NULL,
    decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_recovery_circle_votes_request
    FOREIGN KEY (request_id) REFERENCES recovery_circle_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_recovery_circle_votes_user
    FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_recovery_circle_vote UNIQUE (request_id, member_user_id)
    );

CREATE INDEX IF NOT EXISTS idx_recovery_circle_votes_member
    ON recovery_circle_votes(member_user_id, decided_at DESC);
