package com.vault.theguardian.auth;

import jakarta.validation.constraints.NotNull;

public record TwoFactorToggleRequest(
        @NotNull(message = "Choose whether two-factor authentication is enabled.")
        Boolean enabled
) {}
