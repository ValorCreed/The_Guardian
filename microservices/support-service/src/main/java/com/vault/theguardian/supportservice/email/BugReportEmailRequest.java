package com.vault.theguardian.supportservice.email;

import java.time.LocalDateTime;

public record BugReportEmailRequest(
        String toEmail,
        String reporterName,
        String reporterEmail,
        Long reportId,
        String title,
        String category,
        String severity,
        String description,
        String stepsToReproduce,
        String deviceInfo,
        String appVersion,
        LocalDateTime createdAt
) {}
