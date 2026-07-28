package com.vault.theguardian.auth;

import java.time.LocalDateTime;

public record RegistrationStartResponse(
        String email,
        String message,
        LocalDateTime codeExpiresAt,
        boolean verificationEmailSent
) {}
