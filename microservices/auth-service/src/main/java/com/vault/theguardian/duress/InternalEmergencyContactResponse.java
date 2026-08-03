package com.vault.theguardian.duress;

public record InternalEmergencyContactResponse(
        Long contactId,
        Long userId,
        String name,
        String email,
        String relationship
) {}
