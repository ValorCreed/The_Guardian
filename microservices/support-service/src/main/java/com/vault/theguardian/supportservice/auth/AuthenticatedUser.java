package com.vault.theguardian.supportservice.auth;

public record AuthenticatedUser(Long userId, String email, String fullName) {}
