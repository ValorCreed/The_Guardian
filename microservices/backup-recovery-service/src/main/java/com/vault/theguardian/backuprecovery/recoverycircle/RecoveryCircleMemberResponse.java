package com.vault.theguardian.backuprecovery.recoverycircle;

public record RecoveryCircleMemberResponse(
        Long id,
        Long userId,
        String name,
        String email
) {}
