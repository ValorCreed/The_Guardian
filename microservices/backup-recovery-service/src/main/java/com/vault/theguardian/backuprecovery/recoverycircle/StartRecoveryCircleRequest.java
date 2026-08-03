package com.vault.theguardian.backuprecovery.recoverycircle;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record StartRecoveryCircleRequest(
        @NotBlank(message = "Email is required")
        @Email(message = "Enter a valid email")
        String email,

        @NotBlank(message = "Recovery code is required")
        String recoveryCode
) {}
