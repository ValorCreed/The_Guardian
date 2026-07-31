package com.vault.theguardian.emailservice.email;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record CodeEmailRequest(
        @NotBlank(message = "Recipient email is required.")
        @Email(message = "Recipient email is invalid.")
        String toEmail,

        @NotBlank(message = "Email code is required.")
        @Pattern(regexp = "\\d{6}", message = "Email code must contain exactly six digits.")
        String code
) {}
