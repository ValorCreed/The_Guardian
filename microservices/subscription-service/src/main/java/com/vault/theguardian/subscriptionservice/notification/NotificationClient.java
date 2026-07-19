package com.vault.theguardian.subscriptionservice.notification;

import com.vault.theguardian.subscriptionservice.subscription.SubscriptionPlan;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.LocalDateTime;

@Component
public class NotificationClient {
    private static final Logger log = LoggerFactory.getLogger(NotificationClient.class);
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public NotificationClient(
            RestClient.Builder builder,
            @Value("${services.notification.url}") String notificationServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(notificationServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public void notifySubscriptionActivated(Long userId, SubscriptionPlan plan, LocalDateTime expiresAt) {
        String planLabel = formatPlan(plan);
        String expiryText = expiresAt == null ? "for the next month" : "until " + expiresAt.toLocalDate();
        publishAfterCommit(new CreateNotificationRequest(
                userId,
                "SUBSCRIPTION_ACTIVATED",
                planLabel + " activated",
                "Your " + planLabel + " plan is now active " + expiryText + ".",
                "/subscription"
        ));
    }

    public void notifySubscriptionCancelled(Long userId) {
        publishAfterCommit(new CreateNotificationRequest(
                userId,
                "SUBSCRIPTION_CANCELLED",
                "Subscription cancelled",
                "Your paid plan has been cancelled and your account has returned to Free.",
                "/subscription"
        ));
    }

    private void publishAfterCommit(CreateNotificationRequest request) {
        if (request.userId() == null) return;

        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publish(request);
                }
            });
            return;
        }
        publish(request);
    }

    private void publish(CreateNotificationRequest request) {
        try {
            restClient.post()
                    .uri("/internal/notifications")
                    .header(HttpHeaders.CONTENT_TYPE, "application/json")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            log.warn("Notification Service could not receive event type={} userId={}: {}",
                    request.type(), request.userId(), exception.getMessage());
        }
    }

    private String formatPlan(SubscriptionPlan plan) {
        if (plan == null) return "Subscription";
        String value = plan.name().toLowerCase();
        return value.substring(0, 1).toUpperCase() + value.substring(1);
    }

    private record CreateNotificationRequest(
            Long userId,
            String type,
            String title,
            String message,
            String actionRoute
    ) {}
}
