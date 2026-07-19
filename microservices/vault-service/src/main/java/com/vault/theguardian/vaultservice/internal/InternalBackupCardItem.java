package com.vault.theguardian.vaultservice.internal;

import java.time.LocalDateTime;

public record InternalBackupCardItem(
        Long id,
        String cardName,
        String encryptedCardNumber,
        String encryptedExpiryDate,
        String encryptedCvv,
        String encryptedCardholderName,
        LocalDateTime createdAt
) {}
