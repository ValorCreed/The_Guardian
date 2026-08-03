package com.vault.theguardian.continuitydrill;

import java.time.LocalDateTime;
import java.util.List;

public record ContinuityOverviewResponse(
        String plan,
        boolean eligible,
        boolean canRun,
        LocalDateTime subscriptionExpiresAt,
        String message,
        ContinuityDrillResponse activeDrill,
        List<ContinuityDrillResponse> history,
        List<ContinuityIncomingRequestResponse> receivedRequests
) {}
