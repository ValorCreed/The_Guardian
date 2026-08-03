package com.vault.theguardian.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Instant;

@Component
public class ContinuityDrillEmailClient {
    private static final Logger log = LoggerFactory.getLogger(ContinuityDrillEmailClient.class);
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public ContinuityDrillEmailClient(
            RestClient.Builder builder,
            @Value("${services.email.url}") String emailServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(emailServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public void sendAcknowledgementRequestAfterCommit(
            String toEmail,
            String ownerName,
            String roles,
            Instant expiresAt
    ) {
        if (toEmail == null || toEmail.isBlank()) return;

        Request request = new Request(
                toEmail.trim(),
                clean(ownerName, "A trusted Guardian user"),
                clean(roles, "Trusted contact"),
                expiresAt
        );

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

    private void publish(Request request) {
        try {
            restClient.post()
                    .uri("/internal/emails/continuity-drill")
                    .header(HttpHeaders.CONTENT_TYPE, "application/json")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            // Email is an additional drill channel. Its outage must never roll back
            // a committed drill or prevent the in-app acknowledgement request.
            log.warn("Email Delivery Service could not receive Continuity Drill notice recipient={}: {}",
                    request.toEmail(), exception.getMessage());
        }
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private record Request(
            String toEmail,
            String ownerName,
            String roles,
            Instant expiresAt
    ) {}
}
