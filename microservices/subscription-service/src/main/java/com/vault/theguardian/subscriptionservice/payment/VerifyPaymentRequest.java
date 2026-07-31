package com.vault.theguardian.subscriptionservice.payment;

import jakarta.validation.constraints.NotBlank;

public record VerifyPaymentRequest(@NotBlank String reference) {}
