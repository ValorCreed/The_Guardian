package com.vault.theguardian.subscriptionservice.subscription;

import java.time.LocalDateTime;

public record SubscriptionEntitlementsResponse(
        Long userId,
        SubscriptionPlan plan,
        boolean active,
        LocalDateTime expiresAt,
        long maxDevices,
        long maxPasswords,
        long maxSecureNotes,
        long maxEmergencyContacts,
        boolean canUploadDocuments,
        boolean canUseBackup,
        boolean canShareVault,
        boolean canUseAdvancedSecurity,
        boolean canUseAdvancedPasswordGenerator,
        boolean canUseBreachMonitoring,
        boolean canUseEmergencyVaultItemSharing,
        boolean canUseCustomEmergencyWaitingPeriod
) {
    public boolean multipleDevicesAllowed() {
        return maxDevices != 1;
    }

    public boolean unlimitedPasswords() {
        return maxPasswords < 0;
    }

    public boolean unlimitedSecureNotes() {
        return maxSecureNotes < 0;
    }
}
