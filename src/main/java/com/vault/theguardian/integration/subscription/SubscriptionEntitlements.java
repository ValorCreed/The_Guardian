package com.vault.theguardian.integration.subscription;

import java.time.LocalDateTime;

public record SubscriptionEntitlements(
        Long userId,
        String plan,
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
    /**
     * A negative device limit means unlimited. A value above one allows
     * more than one trusted device. FREE normally has a limit of one.
     */
    public boolean multipleDevicesAllowed() {
        return maxDevices < 0 || maxDevices > 1;
    }
}