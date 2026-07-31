package com.vault.theguardian.backuprecovery.vault;

import java.time.LocalDateTime;

public record BackupPasswordItem(
        Long id,
        String title,
        String usernameValue,
        String encryptedPassword,
        String website,
        String notes,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
