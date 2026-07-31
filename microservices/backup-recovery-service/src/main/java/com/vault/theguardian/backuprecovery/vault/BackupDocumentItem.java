package com.vault.theguardian.backuprecovery.vault;

import java.time.LocalDateTime;

public record BackupDocumentItem(
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
