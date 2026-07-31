package com.vault.theguardian.auth;

public record SecuritySettingsResponse(
        boolean emailVerified,
        boolean twoFactorEnabled
) {}
