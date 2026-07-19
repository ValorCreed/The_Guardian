package com.vault.theguardian.family;

public record SharedPasswordItemResponse(
        Long id,
        String itemType,
        String title,
        String usernameValue,
        String encryptedPassword,
        String website,
        String notes,
        Long ownerId,
        String ownerName,
        String ownerEmail
) {}
