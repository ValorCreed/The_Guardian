package com.vault.theguardian.emergency;

import java.util.List;

public record EmergencyOverviewResponse(
        String plan,
        boolean premiumOrFamily,
        int contactLimit,
        int contactCount,
        List<EmergencyContactResponse> contacts,
        List<EmergencyAccessRequestResponse> receivedRequests,
        List<EmergencyAccessRequestResponse> sentRequests,
        List<EmergencyAuditLogResponse> auditLogs
) {}
