package com.vault.theguardian.subscription;

import com.vault.theguardian.user.User;
import org.springframework.stereotype.Service;

//Controls feature access like the premium and family featires

//This class contains business logic for subscription features
@Service
public class SubscriptionService {
    private final SubscriptionRepository subscriptionRepository;

    public SubscriptionService(SubscriptionRepository subscriptionRepository) {
        this.subscriptionRepository = subscriptionRepository;
    }

    public Subscription getMySubscription(User user) {
        return subscriptionRepository.findByUser(user)
                .orElseThrow(()-> new RuntimeException("Subscription not found"));
    }
    /**
     * Upgrades or changes a user's subscription tier.
     * @param user The user upgrading their plan.
     * @param plan The new subscription plan (e.g., FREE, PREMIUM, FAMILY).
     * @return The updated and saved Subscription object.
     */

    public Subscription upgradePlan(User user, SubscriptionPlan plan) {
        // Fetch the user's existing subscription using the helper method above.
        Subscription subscription = getMySubscription(user);

        subscription.setPlan(plan);
        subscription.setActive(true);

        return subscriptionRepository.save(subscription);
    }
    /**
     * Checks if a user is allowed to add another item to their vault based on their plan limits.
     * @param user The user attempting to create an item.
     * @param currentVaultCount The number of items the user currently has stored.
     * @return true if they are allowed to create an item, false if they have hit their limit.
     */

    public boolean canCreateVaultItem(User user, long currentVaultCount){
        Subscription subscription = getMySubscription(user);

        if(subscription.getPlan() == SubscriptionPlan.FREE){
            return currentVaultCount <50;
        }
        return true;
    }

        //Checks if a user is allowed to upload a document/ files based on their subscription
    public boolean canUploadDocuments(User user){
        Subscription subscription = getMySubscription(user);

        return subscription.getPlan() == SubscriptionPlan.PREMIUM|| subscription.getPlan() == SubscriptionPlan.FAMILY;
    }

    //Allows for users to share the vault but would be activated later
    public boolean canShareVault(User user) {
            // Fetch the user's subscription details.
        Subscription subscription = getMySubscription(user);

            // Returns true if the user is on the PREMIUM or FAMILY tier.
        return subscription.getPlan() == SubscriptionPlan.PREMIUM || subscription.getPlan() == SubscriptionPlan.FAMILY;
        }

    }

