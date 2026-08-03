package com.vault.theguardian.duress;

public record DuressContactOption(
        Long contactId,
        Long userId,
        String name,
        String email,
        String relationship
) {}
