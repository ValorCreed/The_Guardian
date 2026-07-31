package com.vault.theguardian.securityhealthservice.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
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

    public void notifySecurityScanAlert(
            Long userId,
            int score,
            int totalIssues,
            int breachedCount,
            int weakCount,
            int reusedCount,
            int oldCount
    ) {
        if (userId == null) return;

        if (breachedCount > 0) {
            publish(new Request(
                    userId,
                    "PASSWORD_BREACHED",
                    "Breached password warning",
                    breachedCount + " saved password"
                            + (breachedCount == 1 ? " appears" : "s appear")
                            + " in public breach data. Change affected passwords immediately.",
                    "/securityhealth"
            ));
            return;
        }

        publish(new Request(
                userId,
                "SECURITY_SCAN_ALERT",
                "Security scan needs attention",
                "Your vault scan found " + totalIssues + " issue"
                        + (totalIssues == 1 ? "" : "s")
                        + ". Score: " + score
                        + ". Weak: " + weakCount
                        + ", reused: " + reusedCount
                        + ", old: " + oldCount + ".",
                "/securityhealth"
        ));
    }

    private void publish(Request request) {
        try {
            restClient.post()
                    .uri("/internal/notifications")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            // Preserve existing behavior: a notification outage must not fail the scan endpoint.
            log.warn(
                    "Notification Service could not receive type={} userId={}: {}",
                    request.type(), request.userId(), exception.getMessage()
            );
        }
    }

    private record Request(
            Long userId,
            String type,
            String title,
            String message,
            String actionRoute
    ) {}
}
