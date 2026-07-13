package com.vault.theguardian.emergency;

import java.time.LocalDateTime;

public record EmergencyContactResponse(
        Long id,
        String contactEmail,
        String contactName,
        String relationship,
        int waitingPeriodHours,
        boolean allowPasswords,
        boolean allowCards,
        boolean allowDocuments,
        boolean allowNotes,
        String encryptedEmergencyNote,
        boolean active,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
