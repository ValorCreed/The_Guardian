package com.vault.theguardian.notificationservice.push;

import java.time.LocalDateTime;

public record PushTokenResponse(
        boolean registered,
        String installationId,
        String platform,
        String deviceName,
        LocalDateTime lastSeenAt
) {}
