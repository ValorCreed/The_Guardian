package com.vault.theguardian.continuitydrill;

import java.time.Instant;

public record ContinuityParticipantResponse(
        Long userId,
        String name,
        String email,
        String roles,
        String status,
        boolean eligible,
        Instant notifiedAt,
        Instant acknowledgedAt
) {}
