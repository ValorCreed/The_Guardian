package com.vault.theguardian.payment;

public record VerifyPaymentResponse(
        String status,
        String plan
) {}