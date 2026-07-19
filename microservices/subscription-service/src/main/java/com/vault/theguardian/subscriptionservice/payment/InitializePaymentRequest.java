package com.vault.theguardian.subscriptionservice.payment;

import com.vault.theguardian.subscriptionservice.subscription.SubscriptionPlan;
import jakarta.validation.constraints.NotNull;

public record InitializePaymentRequest(@NotNull SubscriptionPlan plan) {}
