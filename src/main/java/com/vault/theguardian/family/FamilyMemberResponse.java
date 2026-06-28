package com.vault.theguardian.family;

import java.time.LocalDateTime;

public record FamilyMemberResponse(
        Long membershipId,
        Long userId,
        String fullName,
        String email,
        LocalDateTime joinedAt,
        boolean sharePasswords,
        boolean shareCards,
        boolean shareDocuments
) {}
