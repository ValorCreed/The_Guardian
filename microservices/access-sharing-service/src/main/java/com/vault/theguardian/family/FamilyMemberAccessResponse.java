package com.vault.theguardian.family;

import java.util.List;

public record FamilyMemberAccessResponse(
        Long membershipId,
        Long userId,
        String fullName,
        String email,
        List<Long> passwordItemIds,
        List<Long> cardItemIds,
        List<Long> documentItemIds,
        List<Long> noteItemIds
) {}
