package com.vault.theguardian.supportservice.email;

public record EmailDeliveryResponse(boolean sent, String message) {}
