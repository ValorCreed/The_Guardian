package com.vault.theguardian.estate;

import java.time.Instant;

public record EstateExecutionResponse(
        Long id,
        Long playbookId,
        String ownerName,
        String ownerEmail,
        String recipientName,
        String recipientEmail,
        String itemType,
        Long itemId,
        String itemTitle,
        String actionType,
        String sourceType,
        String status,
        String instructions,
        boolean itemAvailable,
        boolean canOpen,
        boolean canCancel,
        boolean canComplete,
        Instant releasedAt,
        Instant viewedAt,
        Instant completedAt,
        Instant cancelledAt
) {}
