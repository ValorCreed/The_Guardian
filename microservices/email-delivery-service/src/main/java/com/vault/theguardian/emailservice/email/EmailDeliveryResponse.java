package com.vault.theguardian.emailservice.email;

public record EmailDeliveryResponse(boolean sent, String message) {}
