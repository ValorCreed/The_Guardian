package com.vault.theguardian.incident;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RotateIncidentPasswordRequest(
        @NotBlank String currentPassword,
        @NotBlank @Size(min = 10, max = 128) String newPassword
) {}
