package com.vault.theguardian.notes;

import jakarta.validation.constraints.NotBlank;

public record SecureNoteRequest(
        @NotBlank
        String title,
        String category,
        @NotBlank
        String encryptedContent,
        Boolean pinned
) {
}
