package com.vault.theguardian.securityhealthservice.securityalert;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record SecurityAlertRequest(
        @NotNull(message = "Security score is required.")
        @Min(value = 0, message = "Security score cannot be below 0.")
        @Max(value = 100, message = "Security score cannot exceed 100.")
        Integer score,

        @NotNull(message = "Total issue count is required.")
        @Min(value = 0, message = "Total issue count cannot be negative.")
        Integer totalIssues,

        @NotNull(message = "Breached-password count is required.")
        @Min(value = 0, message = "Breached-password count cannot be negative.")
        Integer breachedCount,

        @NotNull(message = "Weak-password count is required.")
        @Min(value = 0, message = "Weak-password count cannot be negative.")
        Integer weakCount,

        @NotNull(message = "Reused-password count is required.")
        @Min(value = 0, message = "Reused-password count cannot be negative.")
        Integer reusedCount,

        @NotNull(message = "Old-password count is required.")
        @Min(value = 0, message = "Old-password count cannot be negative.")
        Integer oldCount
) {}
