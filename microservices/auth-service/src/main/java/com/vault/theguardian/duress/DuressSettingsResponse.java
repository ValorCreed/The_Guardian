package com.vault.theguardian.duress;

import java.time.LocalDateTime;
import java.util.List;

public record DuressSettingsResponse(
        String plan,
        boolean eligible,
        boolean canConfigure,
        boolean enabled,
        boolean alertEnabled,
        Long alertContactUserId,
        String alertContactEmail,
        String alertContactName,
        int alertDelayMinutes,
        long pendingAlertCount,
        LocalDateTime updatedAt,
        String message,
        List<DuressContactOption> contacts
) {}
