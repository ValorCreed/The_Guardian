package com.vault.theguardian.backuprecovery.recoverycircle;

import java.time.LocalDateTime;

public record RecoveryCirclePublicStatusResponse(
        String status,
        int approvalCount,
        int threshold,
        LocalDateTime expiresAt,
        boolean canComplete,
        String message
) {}
