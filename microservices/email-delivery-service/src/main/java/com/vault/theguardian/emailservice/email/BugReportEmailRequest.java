package com.vault.theguardian.emailservice.email;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public record BugReportEmailRequest(
        @Email(message = "Support recipient email is invalid.")
        String toEmail,

        @Size(max = 200)
        String reporterName,

        @Size(max = 320)
        String reporterEmail,

        @NotNull(message = "Report ID is required.")
        Long reportId,

        @NotBlank(message = "Bug title is required.")
        @Size(max = 140)
        String title,

        @Size(max = 60)
        String category,

        @Size(max = 30)
        String severity,

        @NotBlank(message = "Bug description is required.")
        @Size(max = 4000)
        String description,

        @Size(max = 4000)
        String stepsToReproduce,

        @Size(max = 1500)
        String deviceInfo,

        @Size(max = 80)
        String appVersion,

        LocalDateTime createdAt
) {}
