package com.vault.theguardian.incident;

import java.time.LocalDateTime;

public record IncidentVaultItem(
        Long id,
        Long ownerId,
        String itemType,
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
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
