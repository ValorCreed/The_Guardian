package com.vault.theguardian.incident;

import java.time.LocalDateTime;
import java.util.List;

public record SecurityIncidentResponse(
        Long id,
        String publicId,
        String type,
        String status,
        String planSnapshot,
        String safeDeviceName,
        String note,
        int progress,
        int sessionsRevoked,
        int biometricsRevoked,
        LocalDateTime startedAt,
        LocalDateTime completedAt,
        LocalDateTime cancelledAt,
        boolean canComplete,
        boolean canCancel,
        List<IncidentTaskResponse> tasks,
        List<IncidentTimelineResponse> timeline
) {}
