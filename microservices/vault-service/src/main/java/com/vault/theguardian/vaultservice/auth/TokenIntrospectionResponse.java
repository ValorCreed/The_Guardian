package com.vault.theguardian.vaultservice.auth;

public record TokenIntrospectionResponse(boolean active, Long userId, String email) {}
