package com.vault.theguardian.internal.auth;

public record TokenIntrospectionResponse(boolean active, Long userId, String email) {
    public static TokenIntrospectionResponse inactive() {
        return new TokenIntrospectionResponse(false, null, null);
    }
}
