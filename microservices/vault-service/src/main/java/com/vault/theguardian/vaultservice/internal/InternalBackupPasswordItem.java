package com.vault.theguardian.vaultservice.internal;

import java.time.LocalDateTime;

public record InternalBackupPasswordItem(
        Long id,
        String title,
        String usernameValue,
        String encryptedPassword,
        String website,
        String notes,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
