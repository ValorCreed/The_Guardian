package com.vault.theguardian.notificationservice.auth;

public record TokenIntrospectionResponse(boolean active, Long userId, String email) {}
