package com.vault.theguardian.family;

public record SharedVaultOwnerResponse(
        Long ownerId,
        String fullName,
        String email
) {
}
