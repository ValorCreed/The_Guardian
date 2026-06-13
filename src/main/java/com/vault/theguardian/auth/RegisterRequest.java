package com.vault.theguardian.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank String fullname,

        @Email
        @NotBlank String email,

        @Size(min=8,message="Password must be at least 8 characters")
        String password
) {}
