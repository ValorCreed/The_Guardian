package com.vault.theguardian.backuprecovery.recoverycircle;

public record RecoveryCircleCandidateResponse(
        Long contactId,
        Long userId,
        String name,
        String email,
        String relationship
) {}
