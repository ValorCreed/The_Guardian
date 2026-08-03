package com.vault.theguardian.safetycheck;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateSafetyCheckRequest(
        @NotNull(message = "Choose whether Guardian Safety Check is enabled.")
        Boolean enabled,

        Long contactId,

        @Min(value = 1, message = "Check-in interval must be at least 1 day.")
        @Max(value = 30, message = "Check-in interval cannot exceed 30 days.")
        Integer intervalDays,

        @Min(value = 12, message = "Grace period must be at least 12 hours.")
        @Max(value = 72, message = "Grace period cannot exceed 72 hours.")
        Integer gracePeriodHours
) {}
