package com.vault.theguardian.family;

import java.util.List;

public record UpdateFamilyMemberAccessRequest(
        boolean sharePasswords,
        boolean shareCards,
        boolean shareDocuments,
        boolean shareNotes,
        List<Long> passwordItemIds,
        List<Long> cardItemIds,
        List<Long> documentItemIds,
        List<Long> noteItemIds
) {}
