package com.vault.theguardian.backuprecovery.recovery;

import java.time.LocalDateTime;

public record RecoveryKitStatusResponse(
        boolean created,
        String recoveryId,
        LocalDateTime createdAt,
        LocalDateTime lastUsedAt
) {}
