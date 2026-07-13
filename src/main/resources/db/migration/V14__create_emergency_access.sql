CREATE TABLE IF NOT EXISTS emergency_contacts (
                                                  id BIGSERIAL PRIMARY KEY,
                                                  owner_id BIGINT NOT NULL,
                                                  contact_user_id BIGINT,
                                                  contact_email VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    relationship VARCHAR(255),
    waiting_period_hours INTEGER NOT NULL DEFAULT 72,
    allow_passwords BOOLEAN NOT NULL DEFAULT FALSE,
    allow_cards BOOLEAN NOT NULL DEFAULT FALSE,
    allow_documents BOOLEAN NOT NULL DEFAULT FALSE,
    allow_notes BOOLEAN NOT NULL DEFAULT TRUE,
    encrypted_emergency_note TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_emergency_contacts_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_emergency_contacts_contact_user FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uk_emergency_owner_contact UNIQUE (owner_id, contact_email)
    );

CREATE TABLE IF NOT EXISTS emergency_access_requests (
                                                         id BIGSERIAL PRIMARY KEY,
                                                         contact_id BIGINT NOT NULL,
                                                         owner_id BIGINT NOT NULL,
                                                         requester_id BIGINT NOT NULL,
                                                         status VARCHAR(40) NOT NULL,
    message TEXT,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    available_at TIMESTAMP NOT NULL,
    approved_at TIMESTAMP,
    denied_at TIMESTAMP,
    released_at TIMESTAMP,
    CONSTRAINT fk_emergency_requests_contact FOREIGN KEY (contact_id) REFERENCES emergency_contacts(id) ON DELETE CASCADE,
    CONSTRAINT fk_emergency_requests_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_emergency_requests_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_emergency_requests_owner ON emergency_access_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_requester ON emergency_access_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_status ON emergency_access_requests(status);

CREATE TABLE IF NOT EXISTS emergency_access_audit_logs (
                                                           id BIGSERIAL PRIMARY KEY,
                                                           owner_id BIGINT NOT NULL,
                                                           actor_id BIGINT NOT NULL,
                                                           action VARCHAR(60) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_emergency_audit_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_emergency_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_emergency_audit_owner ON emergency_access_audit_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_emergency_audit_actor ON emergency_access_audit_logs(actor_id);
