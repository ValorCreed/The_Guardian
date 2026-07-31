package com.vault.theguardian.vaultservice.vault;

import java.time.LocalDateTime;

public record VaultResponse(
        Long id,
        String title,
        String usernameValue,
        String encryptedPassword,
        String website,
        String notes,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
