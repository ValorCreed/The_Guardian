package com.vault.theguardian.emergency;

import java.time.LocalDateTime;

public record EmergencyAccessRequestResponse(
        Long id,
        Long contactId,
        String ownerEmail,
        String ownerName,
        String requesterEmail,
        String requesterName,
        String status,
        String message,
        LocalDateTime requestedAt,
        LocalDateTime availableAt,
        LocalDateTime approvedAt,
        LocalDateTime deniedAt,
        boolean passwordsAllowed,
        boolean cardsAllowed,
        boolean documentsAllowed,
        boolean notesAllowed,
        String encryptedEmergencyNote
) {}
