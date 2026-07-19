package com.vault.theguardian.subscriptionservice.internal;

import com.vault.theguardian.subscriptionservice.payment.PaymentRepository;
import com.vault.theguardian.subscriptionservice.subscription.SubscriptionEntitlementsResponse;
import com.vault.theguardian.subscriptionservice.subscription.SubscriptionResponse;
import com.vault.theguardian.subscriptionservice.subscription.SubscriptionService;
import jakarta.transaction.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/subscriptions")
public class InternalSubscriptionController {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final InternalServiceKeyValidator keyValidator;
    private final SubscriptionService subscriptionService;
    private final PaymentRepository paymentRepository;

    public InternalSubscriptionController(
            InternalServiceKeyValidator keyValidator,
            SubscriptionService subscriptionService,
            PaymentRepository paymentRepository
    ) {
        this.keyValidator = keyValidator;
        this.subscriptionService = subscriptionService;
        this.paymentRepository = paymentRepository;
    }

    @PutMapping("/users/{userId}/free")
    public SubscriptionResponse ensureFreeSubscription(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String internalKey,
            @PathVariable Long userId
    ) {
        keyValidator.requireValid(internalKey);
        return subscriptionService.ensureFreeSubscription(userId);
    }

    @GetMapping("/users/{userId}")
    public SubscriptionResponse getSubscription(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String internalKey,
            @PathVariable Long userId
    ) {
        keyValidator.requireValid(internalKey);
        return subscriptionService.getMySubscription(userId);
    }

    @GetMapping("/users/{userId}/entitlements")
    public SubscriptionEntitlementsResponse getEntitlements(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String internalKey,
            @PathVariable Long userId
    ) {
        keyValidator.requireValid(internalKey);
        return subscriptionService.getEntitlements(userId);
    }

    @DeleteMapping("/users/{userId}")
    @Transactional
    public void deleteBillingData(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String internalKey,
            @PathVariable Long userId
    ) {
        keyValidator.requireValid(internalKey);
        paymentRepository.deleteByUserId(userId);
        subscriptionService.deleteForUser(userId);
    }
}
