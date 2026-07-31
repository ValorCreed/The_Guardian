package com.vault.theguardian.securityhealthservice.securityalert;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record SecurityAlertRequest(
        @Min(0) @Max(100) int score,
        @Min(0) int totalIssues,
        @Min(0) int breachedCount,
        @Min(0) int weakCount,
        @Min(0) int reusedCount,
        @Min(0) int oldCount
) {}
