package com.vault.theguardian.vaultservice.vault;

import jakarta.validation.constraints.NotBlank;

public record VaultRequest(
        @NotBlank String title,
        String usernameValue,
        @NotBlank String encryptedPassword,
        String website,
        String notes
) {}
