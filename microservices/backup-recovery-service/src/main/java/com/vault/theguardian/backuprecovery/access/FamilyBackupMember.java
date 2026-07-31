package com.vault.theguardian.backuprecovery.access;

import java.time.LocalDateTime;

public record FamilyBackupMember(
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
