package com.vault.theguardian.securityhealthservice.auth;

public record AuthenticatedUser(Long userId, String email) {}
