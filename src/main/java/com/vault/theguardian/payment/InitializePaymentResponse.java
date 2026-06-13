package com.vault.theguardian.payment;

public record InitializePaymentResponse(
        String authorizationUrl,
        String accessCode,
        String reference
) {}