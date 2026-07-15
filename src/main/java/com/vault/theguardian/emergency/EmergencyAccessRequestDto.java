package com.vault.theguardian.emergency;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record EmergencyAccessRequestDto(
        @NotBlank(message = "Vault owner email is required")
        @Email(message = "Enter a valid owner email")
        String ownerEmail,
        String message
) {}
