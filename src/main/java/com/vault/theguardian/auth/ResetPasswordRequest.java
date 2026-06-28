package com.vault.theguardian.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @Email @NotBlank String email,
        @NotBlank String code,
        @Size(min = 8, message = "Password must be at least 8 characters") String newPassword
) {}
