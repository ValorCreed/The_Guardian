package com.vault.theguardian.recovery;

public record RecoveryContinuityMember(
        Long userId,
        String name,
        String email
) {}
