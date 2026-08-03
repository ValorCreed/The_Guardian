package com.vault.theguardian.recovery;

import java.util.List;

public record RecoveryContinuitySnapshot(
        boolean recoveryCircleConfigured,
        boolean recoveryCircleActive,
        int approvalThreshold,
        boolean recoveryKitActive,
        List<RecoveryContinuityMember> members
) {
    public RecoveryContinuitySnapshot {
        members = members == null ? List.of() : List.copyOf(members);
    }
}
