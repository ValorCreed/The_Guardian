package com.vault.theguardian.vaultservice.notes;

import java.time.LocalDateTime;

public record SecureNoteResponse(
        Long id,
        String title,
        String category,
        String encryptedContent,
        boolean pinned,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
