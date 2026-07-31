CREATE TABLE IF NOT EXISTS family_shared_items (
                                                   id BIGSERIAL PRIMARY KEY,
                                                   membership_id BIGINT NOT NULL,
                                                   item_type VARCHAR(20) NOT NULL,
    item_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_family_shared_items_membership
    FOREIGN KEY (membership_id)
    REFERENCES family_members(id)
    ON DELETE CASCADE,
    CONSTRAINT uk_family_shared_item
    UNIQUE (membership_id, item_type, item_id),
    CONSTRAINT ck_family_shared_item_type
    CHECK (item_type IN ('PASSWORD', 'CARD', 'DOCUMENT', 'NOTE'))
    );

CREATE INDEX IF NOT EXISTS idx_family_shared_items_membership
    ON family_shared_items(membership_id);

CREATE INDEX IF NOT EXISTS idx_family_shared_items_lookup
    ON family_shared_items(membership_id, item_type, item_id);

-- Preserve the behaviour of existing family memberships by selecting every
-- currently shared item. New and updated memberships use explicit selections.
INSERT INTO family_shared_items (membership_id, item_type, item_id)
SELECT fm.id, 'PASSWORD', vi.id
FROM family_members fm
         JOIN family_groups fg ON fg.id = fm.group_id
         JOIN vault_items vi ON vi.user_id = fg.admin_id
WHERE fm.share_passwords = TRUE
    ON CONFLICT DO NOTHING;

INSERT INTO family_shared_items (membership_id, item_type, item_id)
SELECT fm.id, 'CARD', c.id
FROM family_members fm
         JOIN family_groups fg ON fg.id = fm.group_id
         JOIN cards c ON c.user_id = fg.admin_id
WHERE fm.share_cards = TRUE
    ON CONFLICT DO NOTHING;

INSERT INTO family_shared_items (membership_id, item_type, item_id)
SELECT fm.id, 'DOCUMENT', d.id
FROM family_members fm
         JOIN family_groups fg ON fg.id = fm.group_id
         JOIN documents d ON d.user_id = fg.admin_id
WHERE fm.share_documents = TRUE
    ON CONFLICT DO NOTHING;

INSERT INTO family_shared_items (membership_id, item_type, item_id)
SELECT fm.id, 'NOTE', n.id
FROM family_members fm
         JOIN family_groups fg ON fg.id = fm.group_id
         JOIN secure_notes n ON n.user_id = fg.admin_id
WHERE fm.share_notes = TRUE
    ON CONFLICT DO NOTHING;
