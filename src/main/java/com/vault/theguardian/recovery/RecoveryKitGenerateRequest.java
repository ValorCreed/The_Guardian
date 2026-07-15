package com.vault.theguardian.recovery;

import jakarta.validation.constraints.NotBlank;

public record RecoveryKitGenerateRequest(
        @NotBlank(message = "Password is required")
        String password
) {
}
