package com.vault.theguardian.backuprecovery.recoverycircle;

import java.time.LocalDateTime;

public record RecoveryCircleRequestResponse(
        String requestId,
        String ownerName,
        String ownerEmail,
        String status,
        int approvalCount,
        int denialCount,
        int threshold,
        int memberCount,
        LocalDateTime createdAt,
        LocalDateTime expiresAt,
        LocalDateTime approvedAt,
        LocalDateTime completedAt,
        boolean canVote,
        String currentUserDecision
) {}
