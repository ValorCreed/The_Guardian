package com.vault.theguardian.family;

import java.util.List;

public record FamilyMemberPasswordRiskResponse(
        Long id,
        String itemType,
        String title,
        String usernameValue,
        String website,
        Long memberId,
        String memberName,
        String memberEmail,
        int strengthScore,
        String strengthLabel,
        boolean oldPassword,
        boolean reusedPassword,
        int reusedCount,
        List<String> riskTypes
) {}
