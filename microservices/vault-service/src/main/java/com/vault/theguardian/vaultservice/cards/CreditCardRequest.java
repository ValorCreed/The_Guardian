package com.vault.theguardian.vaultservice.cards;

import jakarta.validation.constraints.NotBlank;

public record CreditCardRequest(
        @NotBlank String cardName,
        @NotBlank String encryptedCardNumber,
        @NotBlank String encryptedExpiryDate,
        @NotBlank String encryptedCvv,
        String encryptedCardholderName,
        String encryptedNotes
) {}
