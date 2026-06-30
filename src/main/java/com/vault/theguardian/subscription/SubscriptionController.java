package com.vault.theguardian.subscription;

import com.vault.theguardian.user.User;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/api/subscriptions")
@CrossOrigin
public class SubscriptionController {
    private final SubscriptionService subscriptionService;

    public SubscriptionController(SubscriptionService subscriptionService) {
        this.subscriptionService = subscriptionService;
    }

    @GetMapping("/me")
    public Subscription getMySubscription(@AuthenticationPrincipal User user) {
        return subscriptionService.getMySubscription(user);
    }

    /**
     * Manual upgrade endpoint.
     * If you use Paystack, keep calling this from payment verification after payment succeeds.
     * The subscription lasts for 1 month from the time this method runs.
     */
    @PostMapping("/upgrade")
    public Subscription upgradePlan(
            @AuthenticationPrincipal User user,
            @RequestParam SubscriptionPlan plan
    ) {
        return subscriptionService.upgradePlan(user, plan);
    }

    @PostMapping("/cancel")
    public Subscription cancelSubscription(@AuthenticationPrincipal User user) {
        return subscriptionService.cancelSubscription(user);
    }
}
