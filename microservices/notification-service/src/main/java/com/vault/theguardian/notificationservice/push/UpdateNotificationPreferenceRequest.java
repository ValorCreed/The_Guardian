package com.vault.theguardian.notificationservice.push;

public record UpdateNotificationPreferenceRequest(
        Boolean pushEnabled,
        Boolean securityAlerts,
        Boolean emergencyRecovery,
        Boolean continuityReminders,
        Boolean billing,
        Boolean productUpdates
) {}
