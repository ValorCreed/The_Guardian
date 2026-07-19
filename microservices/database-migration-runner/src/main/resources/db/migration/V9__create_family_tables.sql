CREATE TABLE family_groups (
                               id BIGSERIAL PRIMARY KEY,
                               admin_id BIGINT NOT NULL UNIQUE,
                               created_at TIMESTAMP,
                               CONSTRAINT fk_family_groups_admin
                                   FOREIGN KEY (admin_id)
                                       REFERENCES users(id)
                                       ON DELETE CASCADE
);

CREATE TABLE family_members (
                                id BIGSERIAL PRIMARY KEY,
                                group_id BIGINT NOT NULL,
                                user_id BIGINT NOT NULL UNIQUE,
                                joined_at TIMESTAMP,
                                CONSTRAINT fk_family_members_group
                                    FOREIGN KEY (group_id)
                                        REFERENCES family_groups(id)
                                        ON DELETE CASCADE,
                                CONSTRAINT fk_family_members_user
                                    FOREIGN KEY (user_id)
                                        REFERENCES users(id)
                                        ON DELETE CASCADE,
                                CONSTRAINT uk_family_group_user
                                    UNIQUE (group_id, user_id)
);
