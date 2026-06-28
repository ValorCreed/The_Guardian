package com.vault.theguardian.family;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record AddFamilyMemberRequest(
        @NotBlank
        @Email
        String email,

        boolean sharePasswords,
        boolean shareCards,
        boolean shareDocuments
) {
}
