package com.vault.theguardian.vaultservice.internal;

import java.time.LocalDateTime;

public record InternalBackupDocumentItem(
        Long id,
        String documentName,
        String documentType,
        String encryptedFileUrl,
        String encryptedNotes,
        String storageProvider,
        String storageKey,
        Long sizeBytes,
        LocalDateTime createdAt
) {}
