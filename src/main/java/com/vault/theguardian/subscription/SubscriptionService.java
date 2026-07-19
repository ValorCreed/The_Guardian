package com.vault.theguardian.subscription;

import com.vault.theguardian.integration.notification.NotificationClient;
import com.vault.theguardian.user.User;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class SubscriptionService {

    private static final long FREE_PASSWORD_LIMIT = 10;
    private static final long FREE_SECURE_NOTE_LIMIT = 5;

    private static final long FREE_EMERGENCY_CONTACT_LIMIT = 1;
    private static final long PREMIUM_EMERGENCY_CONTACT_LIMIT = 3;
    private static final long FAMILY_EMERGENCY_CONTACT_LIMIT = 6;
    private final SubscriptionRepository subscriptionRepository;
    private final NotificationClient notificationClient;

    public SubscriptionService(SubscriptionRepository subscriptionRepository,
                               NotificationClient notificationClient) {
        this.subscriptionRepository = subscriptionRepository;
        this.notificationClient = notificationClient;
    }

    public Subscription getMySubscription(User user) {
        if (user == null || user.getId() == null) {
            throw new RuntimeException("Authenticated user could not be resolved.");
        }

        /*
         * Prefer lookup by user id instead of object equality. This prevents
         * false plan failures when the authenticated principal is a detached
         * User object from the security/session layer.
         */
        Subscription subscription = subscriptionRepository.findByUserId(user.getId())
                .orElseGet(() -> createFreeSubscriptionForExistingUser(user));

        return refreshExpiredSubscription(subscription);
    }

    public Subscription upgradePlan(User user, SubscriptionPlan plan) {
        if (plan == null || plan == SubscriptionPlan.FREE) {
            throw new RuntimeException("Choose Premium or Family to upgrade.");
        }

        Subscription subscription = getMySubscription(user);
        LocalDateTime now = LocalDateTime.now();

        subscription.setPlan(plan);
        subscription.setActive(true);
        subscription.setStartedAt(now);
        subscription.setExpiresAt(now.plusMonths(1));

        Subscription saved = subscriptionRepository.save(subscription);
        notificationClient.notifySubscriptionActivated(user, plan, saved.getExpiresAt());
        return saved;
    }

    public Subscription cancelSubscription(User user) {
        Subscription subscription = getMySubscription(user);

        subscription.setPlan(SubscriptionPlan.FREE);
        subscription.setActive(false);
        subscription.setExpiresAt(LocalDateTime.now());

        Subscription saved = subscriptionRepository.save(subscription);
        notificationClient.notifySubscriptionCancelled(user);
        return saved;
    }

    public long getFreePasswordLimit() {
        return FREE_PASSWORD_LIMIT;
    }

    public boolean canCreateVaultItem(User user, long currentVaultCount) {
        Subscription subscription = getMySubscription(user);

        if (!isPaidSubscription(subscription)) {
            return currentVaultCount < FREE_PASSWORD_LIMIT;
        }

        return true;
    }

    public boolean canUploadDocuments(User user) {
        Subscription subscription = getMySubscription(user);
        return isPremiumOrFamily(subscription);
    }

    public boolean canUseBackup(User user) {
        Subscription subscription = getMySubscription(user);
        return isPremiumOrFamily(subscription);
    }

    public boolean isFamilyPlan(User user) {
        Subscription subscription = getMySubscription(user);

        if (subscription == null || subscription.getPlan() == null) {
            return false;
        }

        return subscription.isActive()
                && "FAMILY".equalsIgnoreCase(subscription.getPlan().name());
    }

    public boolean canShareVault(User user) {
        return isFamilyPlan(user);
    }

    public boolean canUseAdvancedSecurity(User user) {
        Subscription subscription = getMySubscription(user);
        return isPremiumOrFamily(subscription);
    }

    public boolean canUseAdvancedPasswordGenerator(User user) {
        Subscription subscription = getMySubscription(user);
        return isPremiumOrFamily(subscription);
    }

    public boolean canUseBreachMonitoring(User user) {
        Subscription subscription = getMySubscription(user);
        return isPremiumOrFamily(subscription);
    }

    public boolean canUseMultipleDevices(User user) {
        Subscription subscription = getMySubscription(user);
        return isPremiumOrFamily(subscription);
    }

    public boolean canCreateSecureNote(User user, long currentNoteCount) {
        Subscription subscription = getMySubscription(user);

        if (!isPaidSubscription(subscription)) {
            return currentNoteCount < FREE_SECURE_NOTE_LIMIT;
        }

        return true;
    }


    public boolean canCreateEmergencyContact(User user, long currentEmergencyContactCount) {
        Subscription subscription = getMySubscription(user);

        if (!isPaidSubscription(subscription)) {
            return currentEmergencyContactCount < FREE_EMERGENCY_CONTACT_LIMIT;
        }

        if (subscription.getPlan() == SubscriptionPlan.PREMIUM) {
            return currentEmergencyContactCount < PREMIUM_EMERGENCY_CONTACT_LIMIT;
        }

        if (subscription.getPlan() == SubscriptionPlan.FAMILY) {
            return currentEmergencyContactCount < FAMILY_EMERGENCY_CONTACT_LIMIT;
        }

        return false;
    }

    public boolean canUseEmergencyVaultItemSharing(User user) {
        Subscription subscription = getMySubscription(user);
        return isPremiumOrFamily(subscription);
    }

    public boolean canUseCustomEmergencyWaitingPeriod(User user) {
        Subscription subscription = getMySubscription(user);
        return isPremiumOrFamily(subscription);
    }

    private Subscription createFreeSubscriptionForExistingUser(User user) {
        Subscription subscription = Subscription.builder()
                .user(user)
                .plan(SubscriptionPlan.FREE)
                .active(false)
                .startedAt(null)
                .expiresAt(null)
                .build();

        return subscriptionRepository.save(subscription);
    }

    private boolean isPremiumOrFamily(Subscription subscription) {
        return subscription != null
                && subscription.isActive()
                && subscription.getPlan() != null
                && (subscription.getPlan() == SubscriptionPlan.PREMIUM
                || subscription.getPlan() == SubscriptionPlan.FAMILY);
    }

    private boolean isPaidSubscription(Subscription subscription) {
        return subscription != null
                && subscription.isActive()
                && subscription.getPlan() != null
                && subscription.getPlan() != SubscriptionPlan.FREE;
    }

    private Subscription refreshExpiredSubscription(Subscription subscription) {
        if (subscription.isActive()
                && subscription.getExpiresAt() != null
                && subscription.getExpiresAt().isBefore(LocalDateTime.now())) {
            subscription.setPlan(SubscriptionPlan.FREE);
            subscription.setActive(false);
            return subscriptionRepository.save(subscription);
        }

        return subscription;
    }
}
