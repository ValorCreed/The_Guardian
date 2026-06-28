package com.vault.theguardian.subscription;

import com.vault.theguardian.user.User;
import org.springframework.stereotype.Service;

@Service
public class SubscriptionService {
    private final SubscriptionRepository subscriptionRepository;

    public SubscriptionService(SubscriptionRepository subscriptionRepository) {
        this.subscriptionRepository = subscriptionRepository;
    }

    public Subscription getMySubscription(User user) {
        return subscriptionRepository.findByUser(user)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));
    }

    public Subscription upgradePlan(User user, SubscriptionPlan plan) {
        Subscription subscription = getMySubscription(user);
        subscription.setPlan(plan);
        subscription.setActive(true);
        return subscriptionRepository.save(subscription);
    }

    //Number of vault items a user can create based on the subscription
    public boolean canCreateVaultItem(User user, long currentVaultCount) {
        Subscription subscription = getMySubscription(user);

        if (subscription.getPlan() == SubscriptionPlan.FREE) {
            return currentVaultCount < 50;
        }

        return true;
    }

    public boolean canUploadDocuments(User user) {
        Subscription subscription = getMySubscription(user);

        return subscription.getPlan() == SubscriptionPlan.PREMIUM
                || subscription.getPlan() == SubscriptionPlan.FAMILY;
    }

    public boolean isFamilyPlan(User user) {
        Subscription subscription = getMySubscription(user);
        return subscription.isActive() && subscription.getPlan() == SubscriptionPlan.FAMILY;
    }

    public boolean canShareVault(User user) {
        return isFamilyPlan(user);
    }
}
