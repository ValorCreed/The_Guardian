package com.vault.theguardian.payment;

import jakarta.validation.constraints.NotBlank;

public record VerifyPaymentRequest(
        @NotBlank
        String reference
) {}
