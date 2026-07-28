package com.vault.theguardian.vaultservice.cards;

import java.time.LocalDateTime;

public record CreditCardResponse(
        Long id,
        String cardName,
        String encryptedCardNumber,
        String encryptedExpiryDate,
        String encryptedCvv,
        String encryptedCardHolderName,
        String encryptedNotes,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
