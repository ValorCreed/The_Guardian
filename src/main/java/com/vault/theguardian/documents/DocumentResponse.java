package com.vault.theguardian.documents;

import java.time.LocalDateTime;

public record DocumentResponse(
        Long id,
        String documentName,
        String documentType,
        String encryptedFileUrl,
        String encryptedNotes,
        Long sizeBytes,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
