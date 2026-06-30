package com.vault.theguardian.backup;

import java.time.LocalDateTime;

public record BackupStatusResponse(
        boolean allowed,
        String plan,
        String message,
        LocalDateTime subscriptionExpiresAt,
        int passwordCount,
        int cardCount,
        int documentCount,
        int familyMemberCount,
        int totalItemCount
) {}
