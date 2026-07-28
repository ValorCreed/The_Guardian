package com.vault.theguardian.backuprecovery.vault;

import java.time.LocalDateTime;

public record BackupCardItem(
        Long id,
        String cardName,
        String encryptedCardNumber,
        String encryptedExpiryDate,
        String encryptedCvv,
        String encryptedCardholderName,
        String encryptedNotes,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
