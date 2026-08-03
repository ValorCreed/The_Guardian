package com.vault.theguardian.backuprecovery.recoverycircle;

import java.time.LocalDateTime;

public record StartRecoveryCircleResponse(
        String requestId,
        int threshold,
        LocalDateTime expiresAt,
        String message
) {}
