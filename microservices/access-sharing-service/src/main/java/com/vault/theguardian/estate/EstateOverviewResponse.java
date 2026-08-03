package com.vault.theguardian.estate;

import java.util.List;

public record EstateOverviewResponse(
        String plan,
        boolean eligible,
        boolean canConfigure,
        boolean vaultAvailable,
        List<EstateContactOption> contacts,
        List<EstateVaultItemOption> vaultItems,
        List<EstatePlaybookResponse> playbooks,
        List<EstateExecutionResponse> releasedByMe,
        List<EstateExecutionResponse> received,
        String message
) {}
