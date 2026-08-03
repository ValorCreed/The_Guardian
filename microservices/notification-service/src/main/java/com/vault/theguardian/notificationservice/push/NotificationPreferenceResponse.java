package com.vault.theguardian.notificationservice.push;

public record NotificationPreferenceResponse(
        boolean pushEnabled,
        boolean securityAlerts,
        boolean emergencyRecovery,
        boolean continuityReminders,
        boolean billing,
        boolean productUpdates
) {}
