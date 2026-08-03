package com.vault.theguardian.incident;

import jakarta.validation.constraints.NotNull;

public record UpdateIncidentTaskRequest(
        @NotNull IncidentTaskStatus status
) {}
