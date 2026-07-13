package com.vault.theguardian.emergency;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record EmergencyAccessRequestDto(
        @Email @NotBlank String ownerEmail,
        String message
) {}
