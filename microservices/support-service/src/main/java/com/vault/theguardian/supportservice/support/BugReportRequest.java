package com.vault.theguardian.supportservice.support;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BugReportRequest(
        @NotBlank(message = "Bug title is required.")
        @Size(max = 140, message = "Bug title must be 140 characters or less.")
        String title,

        @NotBlank(message = "Bug category is required.")
        @Size(max = 60, message = "Bug category must be 60 characters or less.")
        String category,

        @NotBlank(message = "Bug severity is required.")
        @Size(max = 30, message = "Bug severity must be 30 characters or less.")
        String severity,

        @NotBlank(message = "Bug description is required.")
        @Size(max = 4000, message = "Bug description must be 4000 characters or less.")
        String description,

        @Size(max = 4000, message = "Steps to reproduce must be 4000 characters or less.")
        String stepsToReproduce,

        boolean includeDiagnostics,

        @Size(max = 1500, message = "Device info must be 1500 characters or less.")
        String deviceInfo,

        @Size(max = 80, message = "App version must be 80 characters or less.")
        String appVersion
) {}
