package com.vault.theguardian.documents;

import jakarta.validation.constraints.NotBlank;

public record DocumentRequest(
        @NotBlank String documentName,
        String documentType,
        @NotBlank String encryptedFileUrl,
        String encryptedNotes
) {}