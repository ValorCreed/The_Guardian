package com.vault.theguardian.documents;

public record DocumentResponse(
        Long id,
        String documentName,
        String documentType,
        String encryptedFileUrl,
        String encryptedNotes
) {}
