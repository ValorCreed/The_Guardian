package com.vault.theguardian.continuitydrill;

import java.time.Instant;

public record ContinuityAcknowledgementResponse(
        String publicId,
        ContinuityParticipantStatus status,
        Instant acknowledgedAt,
        String message
) {}
