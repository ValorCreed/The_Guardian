package com.vault.theguardian.subscriptionservice.payment;

public record InitializePaymentResponse(
        String authorizationUrl,
        String accessCode,
        String reference
) {}
