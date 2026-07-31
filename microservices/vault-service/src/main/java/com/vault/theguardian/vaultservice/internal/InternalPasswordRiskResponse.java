package com.vault.theguardian.vaultservice.internal;

import java.util.List;

public record InternalPasswordRiskResponse(
        Long id,
        Long ownerId,
        String title,
        String usernameValue,
        String website,
        int strengthScore,
        String strengthLabel,
        boolean oldPassword,
        boolean reusedPassword,
        int reusedCount,
        List<String> riskTypes
) {}
