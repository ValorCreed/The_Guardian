package com.vault.theguardian.family;

import java.time.LocalDateTime;

public record SharedNoteItemResponse(
        Long id,
        String itemType,
        String title,
        String category,
        String encryptedContent,
        boolean pinned,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        Long ownerId,
        String ownerName,
        String ownerEmail
) {}
