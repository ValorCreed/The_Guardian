package com.vault.theguardian.safetycheck;

public record SafetyCheckContactOption(
        Long id,
        String name,
        String email,
        String relationship,
        boolean registered,
        boolean active,
        boolean hasSharedItems
) {}
