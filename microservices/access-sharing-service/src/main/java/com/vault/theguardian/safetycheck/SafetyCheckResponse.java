package com.vault.theguardian.safetycheck;

import java.time.Instant;
import java.util.List;

public record SafetyCheckResponse(
        String plan,
        boolean eligible,
        boolean canConfigure,
        boolean configured,
        boolean enabled,
        String status,
        Long contactId,
        String contactName,
        String contactEmail,
        Integer intervalDays,
        Integer gracePeriodHours,
        Instant lastCheckInAt,
        Instant nextCheckInAt,
        Instant graceStartedAt,
        Instant triggeredAt,
        Long triggeredRequestId,
        List<SafetyCheckContactOption> contacts,
        String message
) {}
