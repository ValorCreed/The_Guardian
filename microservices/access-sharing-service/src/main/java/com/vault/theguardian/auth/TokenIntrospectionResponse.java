package com.vault.theguardian.auth;

public record TokenIntrospectionResponse(boolean active, Long userId, String email) {}
