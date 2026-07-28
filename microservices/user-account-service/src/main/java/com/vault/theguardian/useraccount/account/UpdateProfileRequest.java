package com.vault.theguardian.useraccount.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @NotBlank(message = "Username is required.")
        @Size(min = 2, max = 60, message = "Username must be between 2 and 60 characters.")
        String fullName
) {}
