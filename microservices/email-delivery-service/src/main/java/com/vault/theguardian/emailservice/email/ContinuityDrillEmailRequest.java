package com.vault.theguardian.emailservice.email;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record ContinuityDrillEmailRequest(
        @NotBlank(message = "Recipient email is required.")
        @Email(message = "Recipient email is invalid.")
        String toEmail,

        @NotBlank(message = "Owner name is required.")
        @Size(max = 200, message = "Owner name is too long.")
        String ownerName,

        @NotBlank(message = "Continuity role is required.")
        @Size(max = 500, message = "Continuity role is too long.")
        String roles,

        @NotNull(message = "Drill expiry is required.")
        Instant expiresAt
) {}
