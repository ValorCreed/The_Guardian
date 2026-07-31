CREATE TABLE subscriptions(
    id BIGSERIAL PRIMARY KEY ,
    user_id BIGINT NOT NULL UNIQUE ,
    plan varchar(50) not null default 'FREE',
    active boolean not null DEFAULT true,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    CONSTRAINT FK_SUBSCRIPTION_USER FOREIGN KEY (user_id) REFERENCES users(id) on delete cascade

);