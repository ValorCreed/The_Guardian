package com.vault.theguardian.internal.emergency;

public record InternalRecoveryContactResponse(
        Long contactId,
        Long userId,
        String name,
        String email,
        String relationship
) {}
