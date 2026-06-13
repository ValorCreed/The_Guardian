CREATE Table users(
    id BIGSERIAL PRIMARY KEY ,
    full_name VARCHAR(150) not null ,
    email VARCHAR(150) not null unique,
    password_hash TEXT not null,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

CREATE TABLE vault_items(
    id BIGSERIAL primary key ,
    user_id BIGINT NOT NULL ,
    title VARCHAR(150) not null ,
    username_value VARCHAR(150),
    encrypted_password TEXT NOT NULL,
    WEBSITE varchar(225),
    notes TEXT,
    created_at TIMESTAMP default current_timestamp,
    constraint fk_user foreign key (user_id) references users(id) on delete cascade
)