package com.vault.theguardian.family;

import java.util.List;

public record FamilyOverviewResponse(
        boolean familyPlan,
        boolean admin,
        Long groupId,
        int memberLimit,
        int memberCount,
        List<FamilyMemberResponse> members,
        List<SharedVaultOwnerResponse> sharedVaultOwners
) {
}
