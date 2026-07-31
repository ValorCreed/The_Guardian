package com.vault.theguardian.vaultservice.cards;

public record CreditCardResponse(
        Long id,
        String cardName,
        String encryptedCardNumber,
        String encryptedExpiryDate,
        String encryptedCvv,
        String encryptedCardHolderName
) {}
