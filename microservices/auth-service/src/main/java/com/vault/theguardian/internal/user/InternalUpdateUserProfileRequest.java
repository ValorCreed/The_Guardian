package com.vault.theguardian.internal.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record InternalUpdateUserProfileRequest(
        @NotBlank(message = "Username is required.")
        @Size(min = 2, max = 60, message = "Username must be between 2 and 60 characters.")
        String fullName
) {}
