CREATE TABLE payments(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    reference VARCHAR(225) NOT NULL UNIQUE,
    plan VARCHAR(50) NOT NULL,
    amount INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,
    authorization_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP,

    CONSTRAINT fk_payment_user FOREIGN KEY (user_id) references users(id) on delete cascade
)