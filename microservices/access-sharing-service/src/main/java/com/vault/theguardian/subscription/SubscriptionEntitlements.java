package com.vault.theguardian.subscription;

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
        boolean canUseCustomEmergencyWaitingPeriod,
        boolean canUseContinuityDrill
) {}
