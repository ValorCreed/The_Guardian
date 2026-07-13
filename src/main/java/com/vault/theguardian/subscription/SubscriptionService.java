package com.vault.theguardian.subscription;

import com.vault.theguardian.notification.NotificationService;
import com.vault.theguardian.user.User;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class SubscriptionService {
    private final SubscriptionRepository subscriptionRepository;
    private final NotificationService notificationService;

    public SubscriptionService(SubscriptionRepository subscriptionRepository,
                               NotificationService notificationService) {
        this.subscriptionRepository = subscriptionRepository;
        this.notificationService = notificationService;
    }

    public Subscription getMySubscription(User user) {
        Subscription subscription = subscriptionRepository.findByUser(user)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));

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
        notificationService.notifySubscriptionActivated(user, plan, saved.getExpiresAt());
        return saved;
    }

    public Subscription cancelSubscription(User user) {
        Subscription subscription = getMySubscription(user);

        subscription.setPlan(SubscriptionPlan.FREE);
        subscription.setActive(false);
        subscription.setExpiresAt(LocalDateTime.now());

        Subscription saved = subscriptionRepository.save(subscription);
        notificationService.notifySubscriptionCancelled(user);
        return saved;
    }

    public boolean canCreateVaultItem(User user, long currentVaultCount) {
        Subscription subscription = getMySubscription(user);

        if (!isPaidSubscription(subscription)) {
            return currentVaultCount < 50;
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
        return subscription.isActive() && subscription.getPlan() == SubscriptionPlan.FAMILY;
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

    public boolean canUseMultipleDevices(User user) {
        Subscription subscription = getMySubscription(user);
        return isPremiumOrFamily(subscription);
    }

    public boolean canCreateSecureNote(User user, long currentNoteCount) {
        Subscription subscription = getMySubscription(user);

        if (!isPaidSubscription(subscription)) {
            return currentNoteCount < 5;
        }

        return true;
    }


    public boolean canCreateEmergencyContact(User user, long currentEmergencyContactCount) {
        Subscription subscription = getMySubscription(user);

        if (!isPaidSubscription(subscription)) {
            return currentEmergencyContactCount < 1;
        }

        if (subscription.getPlan() == SubscriptionPlan.PREMIUM) {
            return currentEmergencyContactCount < 3;
        }

        if (subscription.getPlan() == SubscriptionPlan.FAMILY) {
            return currentEmergencyContactCount < 6;
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

    private boolean isPremiumOrFamily(Subscription subscription) {
        return subscription.isActive()
                && (subscription.getPlan() == SubscriptionPlan.PREMIUM
                || subscription.getPlan() == SubscriptionPlan.FAMILY);
    }

    private boolean isPaidSubscription(Subscription subscription) {
        return subscription.isActive()
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
