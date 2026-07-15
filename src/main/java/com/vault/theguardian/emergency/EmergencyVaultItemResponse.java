package com.vault.theguardian.emergency;

import java.time.LocalDateTime;

public record EmergencyVaultItemResponse(
        Long id,
        String itemType,
        String title,
        String usernameValue,
        String encryptedPassword,
        String website,
        String notes,
        String fileName,
        String mimeType,
        Long sizeBytes,
        String encryptedData,
        String encryptedCardNumber,
        String encryptedExpiryDate,
        String encryptedCvv,
        String encryptedCardholderName,
        String encryptedCardHolderName,
        String documentName,
        String documentType,
        String encryptedFileUrl,
        String encryptedNotes,
        String category,
        String encryptedContent,
        Boolean pinned,
        String ownerName,
        String ownerEmail,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
