package com.vault.theguardian.backuprecovery.subscription;

import java.time.LocalDateTime;

public record SubscriptionEntitlements(
        Long userId,
        String plan,
        boolean active,
        LocalDateTime expiresAt,
        boolean canUseBackup
) {}
