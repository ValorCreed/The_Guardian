CREATE TABLE IF NOT EXISTS estate_playbooks (
                                                id BIGSERIAL PRIMARY KEY,
                                                owner_id BIGINT NOT NULL,
                                                recipient_contact_id BIGINT,
                                                item_type VARCHAR(20) NOT NULL,
    item_id BIGINT NOT NULL,
    item_title_snapshot VARCHAR(255) NOT NULL,
    action_type VARCHAR(30) NOT NULL,
    trigger_type VARCHAR(30) NOT NULL,
    encrypted_instructions TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT fk_estate_playbooks_owner
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_estate_playbooks_contact
    FOREIGN KEY (recipient_contact_id) REFERENCES emergency_contacts(id) ON DELETE RESTRICT,
    CONSTRAINT ck_estate_playbooks_item_type
    CHECK (item_type IN ('PASSWORD', 'CARD', 'DOCUMENT', 'NOTE')),
    CONSTRAINT ck_estate_playbooks_action_type
    CHECK (action_type IN ('RELEASE', 'TRANSFER', 'CANCEL', 'DELETE', 'ARCHIVE', 'NEVER_RELEASE')),
    CONSTRAINT ck_estate_playbooks_trigger_type
    CHECK (trigger_type IN ('OWNER_RELEASE', 'EMERGENCY_APPROVAL', 'SAFETY_CHECK')),
    CONSTRAINT ck_estate_playbooks_status
    CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
    CONSTRAINT ck_estate_playbooks_recipient
    CHECK (
(action_type = 'NEVER_RELEASE' AND recipient_contact_id IS NULL)
    OR
(action_type <> 'NEVER_RELEASE' AND recipient_contact_id IS NOT NULL)
    )
    );

CREATE INDEX IF NOT EXISTS idx_estate_playbooks_owner
    ON estate_playbooks(owner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_estate_playbooks_contact
    ON estate_playbooks(recipient_contact_id, status);

CREATE INDEX IF NOT EXISTS idx_estate_playbooks_trigger
    ON estate_playbooks(owner_id, trigger_type, recipient_contact_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uk_estate_playbooks_definition
    ON estate_playbooks(
    owner_id,
    item_type,
    item_id,
    action_type,
    trigger_type,
    COALESCE(recipient_contact_id, 0)
    )
    WHERE status IN ('ACTIVE', 'PAUSED');

CREATE UNIQUE INDEX IF NOT EXISTS uk_estate_playbooks_never_release
    ON estate_playbooks(owner_id, item_type, item_id)
    WHERE action_type = 'NEVER_RELEASE' AND status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS estate_playbook_executions (
                                                          id BIGSERIAL PRIMARY KEY,
                                                          playbook_id BIGINT NOT NULL,
                                                          owner_id BIGINT NOT NULL,
                                                          recipient_contact_id BIGINT NOT NULL,
                                                          recipient_user_id BIGINT NOT NULL,
                                                          recipient_email_snapshot VARCHAR(255) NOT NULL,
    recipient_name_snapshot VARCHAR(255) NOT NULL,
    item_type_snapshot VARCHAR(20) NOT NULL,
    item_id_snapshot BIGINT NOT NULL,
    item_title_snapshot VARCHAR(255) NOT NULL,
    action_type_snapshot VARCHAR(30) NOT NULL,
    encrypted_instructions_snapshot TEXT,
    source_type VARCHAR(30) NOT NULL,
    source_reference_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'RELEASED',
    released_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    viewed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    CONSTRAINT fk_estate_executions_playbook
    FOREIGN KEY (playbook_id) REFERENCES estate_playbooks(id) ON DELETE RESTRICT,
    CONSTRAINT fk_estate_executions_owner
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_estate_executions_contact
    FOREIGN KEY (recipient_contact_id) REFERENCES emergency_contacts(id) ON DELETE RESTRICT,
    CONSTRAINT fk_estate_executions_recipient
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT ck_estate_executions_item_type
    CHECK (item_type_snapshot IN ('PASSWORD', 'CARD', 'DOCUMENT', 'NOTE')),
    CONSTRAINT ck_estate_executions_action_type
    CHECK (action_type_snapshot IN ('RELEASE', 'TRANSFER', 'CANCEL', 'DELETE', 'ARCHIVE')),
    CONSTRAINT ck_estate_executions_source_type
    CHECK (source_type IN ('OWNER_RELEASE', 'EMERGENCY_REQUEST', 'SAFETY_CHECK')),
    CONSTRAINT ck_estate_executions_status
    CHECK (status IN ('RELEASED', 'VIEWED', 'COMPLETED', 'CANCELLED'))
    );

CREATE INDEX IF NOT EXISTS idx_estate_executions_owner
    ON estate_playbook_executions(owner_id, released_at DESC);

CREATE INDEX IF NOT EXISTS idx_estate_executions_recipient
    ON estate_playbook_executions(recipient_user_id, released_at DESC);

CREATE INDEX IF NOT EXISTS idx_estate_executions_contact
    ON estate_playbook_executions(recipient_contact_id, released_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uk_estate_execution_automatic_source
    ON estate_playbook_executions(playbook_id, source_type, source_reference_id)
    WHERE source_reference_id IS NOT NULL;
