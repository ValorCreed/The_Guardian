package com.vault.theguardian.notificationservice.notification;

import java.time.LocalDateTime;

public record NotificationResponse(
        Long id,
        NotificationType type,
        String title,
        String message,
        String actionRoute,
        boolean read,
        LocalDateTime createdAt
) {}
