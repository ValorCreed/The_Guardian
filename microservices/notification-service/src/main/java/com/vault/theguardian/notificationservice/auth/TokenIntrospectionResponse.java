package com.vault.theguardian.notificationservice.auth;

public record TokenIntrospectionResponse(
        boolean active,
        Long userId,
        String email,
        String fullName,
        String sessionMode,
        boolean lockdownActive,
        boolean recoveryAuthorized
) {}
