package com.vault.theguardian.vaultservice.auth;

public record AuthenticatedUser(Long userId, String email) {}
