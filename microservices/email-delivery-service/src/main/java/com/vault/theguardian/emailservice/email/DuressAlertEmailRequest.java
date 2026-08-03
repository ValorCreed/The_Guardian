package com.vault.theguardian.emailservice.email;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDateTime;

public record DuressAlertEmailRequest(
        @NotBlank @Email String toEmail,
        String ownerName,
        String ownerEmail,
        LocalDateTime triggeredAt
) {}
