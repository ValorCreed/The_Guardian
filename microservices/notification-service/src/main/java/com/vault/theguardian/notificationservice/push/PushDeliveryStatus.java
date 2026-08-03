package com.vault.theguardian.notificationservice.push;

public enum PushDeliveryStatus {
    QUEUED,
    RETRY,
    SENT,
    DELIVERED,
    FAILED
}
