package com.vault.theguardian.biometric;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record BiometricLoginRequest(
        @NotBlank(message = "Email is required")
        @Email(message = "Enter a valid email")
        String email,
        @NotBlank(message = "Biometric credential is required")
        String credentialToken
) {}
