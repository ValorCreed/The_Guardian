package com.vault.theguardian.biometric;

import java.time.LocalDateTime;

public record BiometricEnrollmentResponse(
        String credentialToken,
        LocalDateTime expiresAt
) {}
