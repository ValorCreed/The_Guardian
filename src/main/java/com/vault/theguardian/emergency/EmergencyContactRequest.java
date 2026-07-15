package com.vault.theguardian.emergency;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record EmergencyContactRequest(
        @NotBlank(message = "Contact email is required")
        @Email(message = "Enter a valid contact email")
        String contactEmail,

        String contactName,
        String relationship,
        Integer waitingPeriodHours,
        Boolean allowPasswords,
        Boolean allowCards,
        Boolean allowDocuments,
        Boolean allowNotes,
        String encryptedEmergencyNote,
        Boolean active
) {}
