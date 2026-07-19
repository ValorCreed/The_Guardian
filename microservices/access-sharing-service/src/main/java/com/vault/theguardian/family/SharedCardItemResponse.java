package com.vault.theguardian.family;

public record SharedCardItemResponse(
        Long id,
        String itemType,
        String cardName,
        String encryptedCardNumber,
        String encryptedExpiryDate,
        String encryptedCvv,
        String encryptedCardholderName,
        Long ownerId,
        String ownerName,
        String ownerEmail
) {}
