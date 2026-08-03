package com.vault.theguardian.backuprecovery.continuity;

public record RecoveryContinuityMemberResponse(
        Long userId,
        String name,
        String email
) {}
