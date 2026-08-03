package com.vault.theguardian.incident;

import jakarta.validation.constraints.NotBlank;

public record CancelIncidentRequest(
        @NotBlank String currentPassword
) {}
