package com.vault.theguardian.continuitydrill;

import java.time.Instant;

public record ContinuityIncomingRequestResponse(
        String publicId,
        String ownerName,
        String ownerEmail,
        String roles,
        String status,
        Instant startedAt,
        Instant expiresAt,
        Instant acknowledgedAt,
        boolean canAcknowledge
) {}
