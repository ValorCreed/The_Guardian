package com.vault.theguardian.legal;

import java.time.LocalDateTime;

public record LegalConsentResponse(
        String version,
        boolean privacyAccepted,
        boolean termsAccepted,
        LocalDateTime acceptedAt,
        String clientSource
) {}
