package com.vault.theguardian.family;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record AddFamilyMemberRequest(
        @NotBlank
        @Email
        String email,

        boolean sharePasswords,
        boolean shareCards,
        boolean shareDocuments,
        boolean shareNotes,

        List<Long> passwordItemIds,
        List<Long> cardItemIds,
        List<Long> documentItemIds,
        List<Long> noteItemIds
) {
}
