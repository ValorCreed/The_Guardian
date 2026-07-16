package com.vault.theguardian.support;

import java.time.LocalDateTime;

public record BugReportResponse(
        Long id,
        String title,
        String category,
        String severity,
        String description,
        String stepsToReproduce,
        boolean includeDiagnostics,
        String deviceInfo,
        String appVersion,
        String status,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
