package com.vault.theguardian.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record VerifyTwoFactorRequest(
        @Email @NotBlank String email,
        @NotBlank String code,
        Boolean forceReplaceDevice
) {
    public boolean shouldForceReplaceDevice() {
        return Boolean.TRUE.equals(forceReplaceDevice);
    }
}
