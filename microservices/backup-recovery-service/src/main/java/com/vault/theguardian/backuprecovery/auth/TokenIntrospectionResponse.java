package com.vault.theguardian.backuprecovery.auth;

public record TokenIntrospectionResponse(boolean active, Long userId, String email) {}
