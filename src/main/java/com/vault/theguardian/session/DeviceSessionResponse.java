package com.vault.theguardian.session;

import java.time.LocalDateTime;

public record DeviceSessionResponse(
        Long id,
        String deviceName,
        String deviceType,
        String ipAddress,
        boolean active,
        boolean current,
        LocalDateTime createdAt,
        LocalDateTime lastSeenAt,
        LocalDateTime revokedAt
) {}
