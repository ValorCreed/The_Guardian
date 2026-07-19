package com.vault.theguardian.subscriptionservice.subscription;

import com.vault.theguardian.subscriptionservice.auth.AuthenticatedUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/vault/api/subscriptions")
@CrossOrigin
public class SubscriptionController {
    private final SubscriptionService subscriptionService;
    private final boolean manualUpgradeEnabled;

    public SubscriptionController(
            SubscriptionService subscriptionService,
            @Value("${subscription.manual-upgrade-enabled:false}") boolean manualUpgradeEnabled
    ) {
        this.subscriptionService = subscriptionService;
        this.manualUpgradeEnabled = manualUpgradeEnabled;
    }

    @GetMapping("/me")
    public SubscriptionResponse getMySubscription(@AuthenticationPrincipal AuthenticatedUser user) {
        return subscriptionService.getMySubscription(user.userId());
    }

    @GetMapping("/entitlements")
    public SubscriptionEntitlementsResponse getMyEntitlements(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return subscriptionService.getEntitlements(user.userId());
    }

    @PostMapping("/upgrade")
    public SubscriptionResponse upgradePlan(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam SubscriptionPlan plan
    ) {
        if (!manualUpgradeEnabled) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Manual subscription upgrades are disabled. Complete payment instead."
            );
        }
        return subscriptionService.upgradePlan(user.userId(), plan);
    }

    @PostMapping("/cancel")
    public SubscriptionResponse cancelSubscription(@AuthenticationPrincipal AuthenticatedUser user) {
        return subscriptionService.cancelSubscription(user.userId());
    }
}
