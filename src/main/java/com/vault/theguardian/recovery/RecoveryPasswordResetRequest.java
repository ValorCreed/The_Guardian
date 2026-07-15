package com.vault.theguardian.recovery;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RecoveryPasswordResetRequest(
        @NotBlank(message = "Recovery ID is required")
        String recoveryId,

        @NotBlank(message = "Recovery key is required")
        String recoveryKey,

        @NotBlank(message = "New password is required")
        @Size(min = 8, message = "Password must be at least 8 characters")
        String newPassword
) {
}
