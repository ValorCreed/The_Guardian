package com.vault.theguardian.backuprecovery.subscription;

import java.time.LocalDateTime;

public record SubscriptionSnapshot(
        Long id,
        Long userId,
        String plan,
        boolean active,
        LocalDateTime startedAt,
        LocalDateTime expiresAt
) {}
