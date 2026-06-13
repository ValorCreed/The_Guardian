package com.vault.theguardian.cards;

public record CreditCardResponse(
        Long id,
        String cardName,
        String encryptedCardNumber,
        String encryptedExpiryDate,
        String encryptedCvv,
        String encryptedCardHolderName
) {
}
