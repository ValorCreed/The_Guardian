package com.vault.theguardian.vaultservice.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

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

    public void notifyPasswordAdded(Long userId, String title) {
        publishAfterCommit(new CreateNotificationRequest(userId, "PASSWORD_ADDED", "Password saved",
                cleanTitle(title, "A password") + " was added to your vault.", "/vault"));
    }

    public void notifyCardAdded(Long userId, String title) {
        publishAfterCommit(new CreateNotificationRequest(userId, "CARD_ADDED", "Card saved",
                cleanTitle(title, "A card") + " was added to your vault.", "/vault"));
    }

    public void notifyDocumentAdded(Long userId, String title) {
        publishAfterCommit(new CreateNotificationRequest(userId, "DOCUMENT_ADDED", "Document saved",
                cleanTitle(title, "A document") + " was added to your document vault.", "/vault"));
    }

    public void notifySecureNoteAdded(Long userId, String title) {
        publishAfterCommit(new CreateNotificationRequest(userId, "NOTE_ADDED", "Secure note saved",
                cleanTitle(title, "A secure note") + " was added to your notes vault.", "/vault?tab=Notes"));
    }

    public void notifySecureNoteUpdated(Long userId, String title) {
        publishAfterCommit(new CreateNotificationRequest(userId, "NOTE_UPDATED", "Secure note updated",
                cleanTitle(title, "A secure note") + " was updated.", "/vault?tab=Notes"));
    }

    public void notifySecureNoteDeleted(Long userId, String title) {
        publishAfterCommit(new CreateNotificationRequest(userId, "NOTE_DELETED", "Secure note deleted",
                cleanTitle(title, "A secure note") + " was removed from your notes vault.", "/vault?tab=Notes"));
    }

    private void publishAfterCommit(CreateNotificationRequest request) {
        if (request.userId() == null) return;
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() { publish(request); }
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

    private String cleanTitle(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private record CreateNotificationRequest(
            Long userId,
            String type,
            String title,
            String message,
            String actionRoute
    ) {}
}
