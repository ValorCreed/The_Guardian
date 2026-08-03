package com.vault.theguardian.backuprecovery.continuity;

import java.util.List;

public record RecoveryContinuitySnapshotResponse(
        boolean recoveryCircleConfigured,
        boolean recoveryCircleActive,
        int approvalThreshold,
        boolean recoveryKitActive,
        List<RecoveryContinuityMemberResponse> members
) {}
