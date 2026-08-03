package com.vault.theguardian.internal.auth;

public record TokenIntrospectionResponse(
        boolean active,
        Long userId,
        String email,
        String fullName,
        String sessionMode,
        boolean lockdownActive,
        boolean recoveryAuthorized
) {
    public static TokenIntrospectionResponse inactive() {
        return new TokenIntrospectionResponse(false, null, null, null, null, false, false);
    }
}
