package com.vault.theguardian.backuprecovery.access;

public record RecoveryContactOption(
        Long contactId,
        Long userId,
        String name,
        String email,
        String relationship
) {}
