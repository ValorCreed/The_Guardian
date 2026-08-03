package com.vault.theguardian.estate;

public record EstateContactOption(
        Long contactId,
        Long userId,
        String name,
        String email,
        String relationship,
        boolean registered,
        boolean active,
        boolean allowPasswords,
        boolean allowCards,
        boolean allowDocuments,
        boolean allowNotes
) {}
