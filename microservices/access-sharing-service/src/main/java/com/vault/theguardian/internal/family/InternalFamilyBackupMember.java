package com.vault.theguardian.internal.family;

import java.time.LocalDateTime;

public record InternalFamilyBackupMember(
        Long membershipId,
        Long groupId,
        Long userId,
        String fullName,
        String email,
        LocalDateTime joinedAt,
        boolean sharePasswords,
        boolean shareCards,
        boolean shareDocuments,
        boolean shareNotes
) {}
