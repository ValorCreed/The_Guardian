package com.vault.theguardian.backup;

import java.time.LocalDateTime;

public record BackupResponse(
        String fileName,
        LocalDateTime createdAt,
        String encryptedBackup,
        long backupSizeBytes,
        String checksum,
        String message,
        int passwordCount,
        int cardCount,
        int documentCount,
        int familyMemberCount,
        int totalItemCount
) {}
