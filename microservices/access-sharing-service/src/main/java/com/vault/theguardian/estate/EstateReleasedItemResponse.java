package com.vault.theguardian.estate;

import java.time.Instant;
import java.time.LocalDateTime;

public record EstateReleasedItemResponse(
        Long executionId,
        String ownerName,
        String ownerEmail,
        String actionType,
        String instructions,
        String itemType,
        Long itemId,
        String title,
        String usernameValue,
        String password,
        String website,
        String notes,
        String cardName,
        String cardNumber,
        String expiryDate,
        String cvv,
        String cardholderName,
        String documentName,
        String documentType,
        Long sizeBytes,
        String documentNotes,
        String category,
        String content,
        Boolean pinned,
        Instant releasedAt,
        Instant viewedAt,
        LocalDateTime itemCreatedAt,
        LocalDateTime itemUpdatedAt
) {}
