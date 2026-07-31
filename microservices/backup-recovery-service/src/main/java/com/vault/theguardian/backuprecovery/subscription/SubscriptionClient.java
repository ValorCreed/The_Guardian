package com.vault.theguardian.backuprecovery.subscription;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

@Component
public class SubscriptionClient {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public SubscriptionClient(
            RestClient.Builder builder,
            @Value("${services.subscription.url}") String subscriptionServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(subscriptionServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public SubscriptionSnapshot getSubscription(Long userId) {
        try {
            SubscriptionSnapshot response = restClient.get()
                    .uri("/internal/subscriptions/users/{userId}", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(SubscriptionSnapshot.class);
            if (response == null) throw unavailable(null);
            return response;
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    public SubscriptionEntitlements getEntitlements(Long userId) {
        try {
            SubscriptionEntitlements response = restClient.get()
                    .uri("/internal/subscriptions/users/{userId}/entitlements", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(SubscriptionEntitlements.class);
            if (response == null) throw unavailable(null);
            return response;
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    private ResponseStatusException unavailable(Throwable cause) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Subscription Service is temporarily unavailable.",
                cause
        );
    }
}
