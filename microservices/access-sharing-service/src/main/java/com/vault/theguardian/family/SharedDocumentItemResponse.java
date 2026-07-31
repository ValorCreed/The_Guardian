package com.vault.theguardian.family;

public record SharedDocumentItemResponse(
        Long id,
        String itemType,
        String documentName,
        String documentType,
        String encryptedFileUrl,
        String encryptedNotes,
        Long ownerId,
        String ownerName,
        String ownerEmail
) {}
