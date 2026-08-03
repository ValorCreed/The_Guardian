package com.vault.theguardian.incident;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record StartIncidentRequest(
        @NotNull SecurityIncidentType type,
        @NotBlank String currentPassword,
        @Size(max = 1000) String note
) {}
