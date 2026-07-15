package com.vault.theguardian.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @Email @NotBlank String email,
        @NotBlank String password,

        /*
         * When true, a FREE user who already has one trusted device
         * can remove the previous device and continue login on this device.
         */
        Boolean forceReplaceDevice
) {
    public boolean shouldForceReplaceDevice() {
        return Boolean.TRUE.equals(forceReplaceDevice);
    }
}
