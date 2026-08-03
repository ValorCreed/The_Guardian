package com.vault.theguardian.incident;

import java.time.LocalDateTime;

public record IncidentTaskResponse(
        Long id,
        String code,
        String title,
        String detail,
        String actionRoute,
        boolean required,
        int priority,
        String status,
        LocalDateTime completedAt
) {}
