package com.vault.theguardian.auth;

public record AuthResponse(
        String token,
        Long userId,
        String fullName,
        String email,
        String plan
) {
}
