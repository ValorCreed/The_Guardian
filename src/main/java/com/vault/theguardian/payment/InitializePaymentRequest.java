package com.vault.theguardian.payment;

import com.vault.theguardian.subscription.SubscriptionPlan;
import jakarta.validation.constraints.NotNull;

public record InitializePaymentRequest(
        @NotNull
        SubscriptionPlan plan
) {}