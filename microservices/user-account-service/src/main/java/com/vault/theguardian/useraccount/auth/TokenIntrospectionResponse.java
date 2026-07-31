package com.vault.theguardian.useraccount.auth;

public record TokenIntrospectionResponse(boolean active, Long userId, String email) {}
