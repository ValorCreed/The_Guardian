package com.vault.theguardian.legal;

import jakarta.validation.constraints.NotBlank;

public record LegalConsentRequest(
        @NotBlank(message = "Consent version is required") String version,
        boolean privacyAccepted,
        boolean termsAccepted,
        String clientSource
) {}
