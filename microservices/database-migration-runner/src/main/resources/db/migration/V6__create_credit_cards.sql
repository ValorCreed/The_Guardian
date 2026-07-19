CREATE TABLE cards(
    id BIGSERIAL PRIMARY KEY ,
    user_id BIGINT NOT NULL ,
    card_name VARCHAR(150) NOT NULL ,
    encrypted_card_number TEXT NOT NULL ,
    encrypted_expiry_date TEXT NOT NULL ,
    encrypted_cvv TEXT NOT NULL ,
    encrypted_cardholder_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_credit_card_user FOREIGN KEY(user_id) references users(id) on delete cascade
);