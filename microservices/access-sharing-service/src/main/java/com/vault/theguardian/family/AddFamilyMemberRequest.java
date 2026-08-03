package com.vault.theguardian.family;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record AddFamilyMemberRequest(
        @NotBlank(message = "Family member email is required.")
        @Email(message = "Enter a valid family member email.")
        String email,

        @NotNull(message = "Choose whether passwords are shared.")
        Boolean sharePasswords,
        @NotNull(message = "Choose whether cards are shared.")
        Boolean shareCards,
        @NotNull(message = "Choose whether documents are shared.")
        Boolean shareDocuments,
        @NotNull(message = "Choose whether secure notes are shared.")
        Boolean shareNotes,

        List<Long> passwordItemIds,
        List<Long> cardItemIds,
        List<Long> documentItemIds,
        List<Long> noteItemIds
) {
}
