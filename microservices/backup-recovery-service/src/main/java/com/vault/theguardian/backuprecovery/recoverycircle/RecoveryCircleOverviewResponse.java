package com.vault.theguardian.backuprecovery.recoverycircle;

import java.util.List;

public record RecoveryCircleOverviewResponse(
        String plan,
        boolean eligible,
        boolean canConfigure,
        boolean configured,
        boolean enabled,
        int threshold,
        List<RecoveryCircleMemberResponse> members,
        List<RecoveryCircleCandidateResponse> candidates,
        List<RecoveryCircleRequestResponse> ownedRequests,
        List<RecoveryCircleRequestResponse> approvalRequests,
        String recoveryCode,
        String message
) {}
