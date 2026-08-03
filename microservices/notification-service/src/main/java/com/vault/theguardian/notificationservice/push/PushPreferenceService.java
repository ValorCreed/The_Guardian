package com.vault.theguardian.notificationservice.push;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;


@Service
public class PushPreferenceService {
    private final NotificationPreferenceRepository repository;
    private final DatabaseClock databaseClock;

    public PushPreferenceService(
            NotificationPreferenceRepository repository,
            DatabaseClock databaseClock
    ) {
        this.repository = repository;
        this.databaseClock = databaseClock;
    }

    @Transactional
    public NotificationPreference getOrCreate(Long userId) {
        return repository.findById(userId).orElseGet(() -> repository.save(
                NotificationPreference.builder()
                        .userId(userId)
                        .pushEnabled(true)
                        .securityAlerts(true)
                        .emergencyRecovery(true)
                        .continuityReminders(true)
                        .billing(true)
                        .productUpdates(false)
                        .updatedAt(databaseClock.now())
                        .build()
        ));
    }

    @Transactional(readOnly = true)
    public boolean allows(Long userId, PushCategory category) {
        NotificationPreference preference = repository.findById(userId).orElse(null);
        if (preference == null) {
            return category != PushCategory.PRODUCT;
        }
        if (!preference.isPushEnabled()) return false;

        return switch (category) {
            case SECURITY -> preference.isSecurityAlerts();
            case EMERGENCY_RECOVERY -> preference.isEmergencyRecovery();
            case CONTINUITY -> preference.isContinuityReminders();
            case BILLING -> preference.isBilling();
            case PRODUCT -> preference.isProductUpdates();
        };
    }

    @Transactional
    public NotificationPreferenceResponse update(
            Long userId,
            UpdateNotificationPreferenceRequest request
    ) {
        NotificationPreference preference = getOrCreate(userId);
        if (request.pushEnabled() != null) preference.setPushEnabled(request.pushEnabled());
        if (request.securityAlerts() != null) preference.setSecurityAlerts(request.securityAlerts());
        if (request.emergencyRecovery() != null) preference.setEmergencyRecovery(request.emergencyRecovery());
        if (request.continuityReminders() != null) preference.setContinuityReminders(request.continuityReminders());
        if (request.billing() != null) preference.setBilling(request.billing());
        if (request.productUpdates() != null) preference.setProductUpdates(request.productUpdates());
        preference.setUpdatedAt(databaseClock.now());
        return toResponse(repository.save(preference));
    }

    @Transactional
    public NotificationPreferenceResponse get(Long userId) {
        return toResponse(getOrCreate(userId));
    }

    @Transactional
    public void setPushEnabled(Long userId, boolean enabled) {
        NotificationPreference preference = getOrCreate(userId);
        preference.setPushEnabled(enabled);
        preference.setUpdatedAt(databaseClock.now());
        repository.save(preference);
    }

    @Transactional
    public void deleteForUser(Long userId) {
        repository.deleteById(userId);
    }

    private NotificationPreferenceResponse toResponse(NotificationPreference preference) {
        return new NotificationPreferenceResponse(
                preference.isPushEnabled(),
                preference.isSecurityAlerts(),
                preference.isEmergencyRecovery(),
                preference.isContinuityReminders(),
                preference.isBilling(),
                preference.isProductUpdates()
        );
    }
}
