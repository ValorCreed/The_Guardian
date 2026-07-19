package com.vault.theguardian.securityhealthservice.auth;

public record TokenIntrospectionResponse(boolean active, Long userId, String email) {}
