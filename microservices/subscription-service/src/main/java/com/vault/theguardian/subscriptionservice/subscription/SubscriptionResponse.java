package com.vault.theguardian.subscriptionservice.subscription;

import java.time.LocalDateTime;

public record SubscriptionResponse(
        Long id,
        Long userId,
        SubscriptionPlan plan,
        boolean active,
        LocalDateTime startedAt,
        LocalDateTime expiresAt
) {}
