package com.vault.theguardian.subscription;

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

    public SubscriptionEntitlements getEntitlements(Long userId) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Authenticated user could not be resolved.");
        }

        try {
            SubscriptionEntitlements response = restClient.get()
                    .uri("/internal/subscriptions/users/{userId}/entitlements", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(SubscriptionEntitlements.class);

            if (response == null) throw unavailable();
            return response;
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw unavailable();
        }
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Subscription Service is temporarily unavailable."
        );
    }
}
