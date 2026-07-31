package com.vault.theguardian.backuprecovery.recovery;

import java.time.LocalDateTime;

public record RecoveryKitResponse(
        String recoveryId,
        String recoveryKey,
        LocalDateTime createdAt,
        String message
) {}
