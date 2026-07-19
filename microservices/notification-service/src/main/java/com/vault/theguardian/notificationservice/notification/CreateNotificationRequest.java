package com.vault.theguardian.notificationservice.notification;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateNotificationRequest(
        @NotNull Long userId,
        @NotNull NotificationType type,
        @NotBlank @Size(max = 255) String title,
        @NotBlank String message,
        @Size(max = 255) String actionRoute
) {}
