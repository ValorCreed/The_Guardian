package com.vault.theguardian.vault;

public record VaultResponse(
        Long id,
        String title,
        String usernameValue,
        String encryptedPassword,
        String website,
        String notes
) {
}
