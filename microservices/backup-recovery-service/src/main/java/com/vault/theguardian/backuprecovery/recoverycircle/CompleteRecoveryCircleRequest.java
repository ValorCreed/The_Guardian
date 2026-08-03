package com.vault.theguardian.backuprecovery.recoverycircle;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CompleteRecoveryCircleRequest(
        @NotBlank(message = "Request ID is required") String requestId,
        @NotBlank(message = "Recovery code is required") String recoveryCode,
        @NotBlank(message = "New password is required")
        @Size(min = 8, message = "Password must be at least 8 characters")
        String newPassword
) {}
