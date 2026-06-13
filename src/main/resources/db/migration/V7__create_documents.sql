CREATE TABLE documents(
    id BIGSERIAL PRIMARY KEY ,
    user_id BIGINT NOT NULL ,
    document_name VARCHAR(150) NOT NULL ,
    document_type VARCHAR(100),
    encrypted_file_url TEXT NOT NULL ,
    encrypted_notes TEXT,
    created_at TIMESTAMP DEFAULT current_timestamp,

    CONSTRAINT fk_document_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
);