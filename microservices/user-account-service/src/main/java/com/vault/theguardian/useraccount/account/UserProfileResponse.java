package com.vault.theguardian.useraccount.account;

public record UserProfileResponse(
        Long userId,
        String fullName,
        String email
) {}
