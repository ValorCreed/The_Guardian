package com.vault.theguardian.subscriptionservice.auth;

public record TokenIntrospectionResponse(boolean active, Long userId, String email) {}
