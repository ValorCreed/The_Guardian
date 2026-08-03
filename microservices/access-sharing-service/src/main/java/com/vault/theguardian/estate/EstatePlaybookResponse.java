package com.vault.theguardian.estate;

import java.time.Instant;

public record EstatePlaybookResponse(
        Long id,
        String itemType,
        Long itemId,
        String itemTitle,
        String actionType,
        String triggerType,
        Long recipientContactId,
        Long recipientUserId,
        String recipientName,
        String recipientEmail,
        String instructions,
        String status,
        boolean itemAvailable,
        Instant createdAt,
        Instant updatedAt
) {}
