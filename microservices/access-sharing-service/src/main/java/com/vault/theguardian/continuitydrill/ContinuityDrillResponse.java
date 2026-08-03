package com.vault.theguardian.continuitydrill;

import java.time.Instant;
import java.util.List;

public record ContinuityDrillResponse(
        Long id,
        String publicId,
        String status,
        int score,
        int staticScore,
        int acknowledgedCount,
        int participantCount,
        Instant startedAt,
        Instant expiresAt,
        Instant completedAt,
        Instant cancelledAt,
        boolean canComplete,
        boolean canCancel,
        List<ContinuityCheckResponse> checks,
        List<ContinuityParticipantResponse> participants
) {}
