package com.vault.theguardian.emergency;

import java.time.LocalDateTime;

public record EmergencyAuditLogResponse(
        Long id,
        String action,
        String title,
        String message,
        String actorEmail,
        LocalDateTime createdAt
) {}
