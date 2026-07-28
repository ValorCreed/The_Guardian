package com.vault.theguardian.useraccount.auth;

public record AuthUserProfileResponse(
        Long id,
        String fullName,
        String email
) {}
