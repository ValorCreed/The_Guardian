package com.vault.theguardian.auth;

public record TwoFactorToggleRequest(
        boolean enabled
) {}
