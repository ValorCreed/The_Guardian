package com.vault.theguardian.subscriptionservice.subscription;

import com.vault.theguardian.subscriptionservice.notification.NotificationClient;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class SubscriptionService {
    public static final long UNLIMITED = -1;
    public static final long FREE_DEVICE_LIMIT = 1;
    public static final long FREE_PASSWORD_LIMIT = 10;
    public static final long FREE_SECURE_NOTE_LIMIT = 5;
    public static final long FREE_EMERGENCY_CONTACT_LIMIT = 1;
    public static final long PREMIUM_EMERGENCY_CONTACT_LIMIT = 3;
    public static final long FAMILY_EMERGENCY_CONTACT_LIMIT = 6;

    private final SubscriptionRepository subscriptionRepository;
    private final NotificationClient notificationClient;

    public SubscriptionService(
            SubscriptionRepository subscriptionRepository,
            NotificationClient notificationClient
    ) {
        this.subscriptionRepository = subscriptionRepository;
        this.notificationClient = notificationClient;
    }

    @Transactional
    public SubscriptionResponse getMySubscription(Long userId) {
        return toResponse(getCurrentSubscription(userId));
    }

    @Transactional
    public SubscriptionEntitlementsResponse getEntitlements(Long userId) {
        return toEntitlements(getCurrentSubscription(userId));
    }

    @Transactional
    public SubscriptionResponse ensureFreeSubscription(Long userId) {
        return toResponse(getCurrentSubscription(userId));
    }

    @Transactional
    public SubscriptionResponse upgradePlan(Long userId, SubscriptionPlan plan) {
        if (plan == null || plan == SubscriptionPlan.FREE) {
            throw new IllegalArgumentException("Choose Premium or Family to upgrade.");
        }

        Subscription subscription = getCurrentSubscription(userId);
        LocalDateTime now = LocalDateTime.now();
        subscription.setPlan(plan);
        subscription.setActive(true);
        subscription.setStartedAt(now);
        subscription.setExpiresAt(now.plusMonths(1));

        Subscription saved = subscriptionRepository.save(subscription);
        notificationClient.notifySubscriptionActivated(userId, plan, saved.getExpiresAt());
        return toResponse(saved);
    }

    @Transactional
    public SubscriptionResponse cancelSubscription(Long userId) {
        Subscription subscription = getCurrentSubscription(userId);
        subscription.setPlan(SubscriptionPlan.FREE);
        subscription.setActive(false);
        subscription.setExpiresAt(LocalDateTime.now());

        Subscription saved = subscriptionRepository.save(subscription);
        notificationClient.notifySubscriptionCancelled(userId);
        return toResponse(saved);
    }

    @Transactional
    public void deleteForUser(Long userId) {
        subscriptionRepository.deleteByUserId(userId);
    }

    private Subscription getCurrentSubscription(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("User id is required.");
        }

        Subscription subscription = subscriptionRepository.findByUserId(userId)
                .orElseGet(() -> subscriptionRepository.save(
                        Subscription.builder()
                                .userId(userId)
                                .plan(SubscriptionPlan.FREE)
                                .active(true)
                                .startedAt(LocalDateTime.now())
                                .expiresAt(null)
                                .build()
                ));

        return refreshExpiredSubscription(subscription);
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

    private SubscriptionResponse toResponse(Subscription subscription) {
        return new SubscriptionResponse(
                subscription.getId(),
                subscription.getUserId(),
                subscription.getPlan(),
                subscription.isActive(),
                subscription.getStartedAt(),
                subscription.getExpiresAt()
        );
    }

    private SubscriptionEntitlementsResponse toEntitlements(Subscription subscription) {
        boolean paid = subscription.isActive()
                && subscription.getPlan() != null
                && subscription.getPlan() != SubscriptionPlan.FREE;
        boolean family = paid && subscription.getPlan() == SubscriptionPlan.FAMILY;

        long emergencyLimit = switch (subscription.getPlan()) {
            case PREMIUM -> paid ? PREMIUM_EMERGENCY_CONTACT_LIMIT : FREE_EMERGENCY_CONTACT_LIMIT;
            case FAMILY -> paid ? FAMILY_EMERGENCY_CONTACT_LIMIT : FREE_EMERGENCY_CONTACT_LIMIT;
            case FREE -> FREE_EMERGENCY_CONTACT_LIMIT;
        };

        return new SubscriptionEntitlementsResponse(
                subscription.getUserId(),
                subscription.getPlan(),
                subscription.isActive(),
                subscription.getExpiresAt(),
                paid ? UNLIMITED : FREE_DEVICE_LIMIT,
                paid ? UNLIMITED : FREE_PASSWORD_LIMIT,
                paid ? UNLIMITED : FREE_SECURE_NOTE_LIMIT,
                emergencyLimit,
                paid,
                paid,
                family,
                paid,
                paid,
                paid,
                paid,
                paid
        );
    }
}
