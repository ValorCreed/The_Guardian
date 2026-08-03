package com.vault.theguardian.incident;

import java.util.List;

public record IncidentOverviewResponse(
        String plan,
        boolean eligible,
        boolean canStart,
        String message,
        SecurityIncidentResponse activeIncident,
        List<SecurityIncidentResponse> history
) {}
