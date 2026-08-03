package com.vault.theguardian.incident;

import java.time.LocalDateTime;

public record IncidentTimelineResponse(
        String eventType,
        String title,
        String detail,
        LocalDateTime createdAt
) {}
