package com.vault.theguardian.integration.subscription;

import com.vault.theguardian.user.User;
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
            @Value("${services.internal-key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(subscriptionServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public SubscriptionSnapshot ensureFreeSubscription(Long userId) {
        requireUserId(userId);

        try {
            SubscriptionSnapshot response = restClient.put()
                    .uri("/internal/subscriptions/users/{userId}/free", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(SubscriptionSnapshot.class);

            return response == null
                    ? new SubscriptionSnapshot(null, userId, "FREE", true, null, null)
                    : response;
        } catch (RestClientException exception) {
            // Temporary compatibility fallback while registration remains in the monolith.
            return new SubscriptionSnapshot(null, userId, "FREE", true, null, null);
        }
    }

    public SubscriptionSnapshot getMySubscription(User user) {
        requireUser(user);

        try {
            SubscriptionSnapshot response = restClient.get()
                    .uri("/internal/subscriptions/users/{userId}", user.getId())
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(SubscriptionSnapshot.class);

            if (response == null) {
                throw unavailable("Subscription Service returned an empty response.");
            }

            return response;
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw unavailable("Subscription Service is temporarily unavailable.");
        }
    }

    /**
     * Used by the temporary monolithic AuthService while authentication is being cut over.
     */
    public SubscriptionEntitlements getEntitlements(Long userId) {
        requireUserId(userId);

        try {
            SubscriptionEntitlements response = restClient.get()
                    .uri("/internal/subscriptions/users/{userId}/entitlements", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(SubscriptionEntitlements.class);

            if (response == null) {
                throw unavailable("Subscription Service returned an empty response.");
            }

            return response;
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw unavailable("Subscription Service is temporarily unavailable.");
        }
    }

    /**
     * Used by the remaining monolith feature services.
     */
    public SubscriptionEntitlements getEntitlements(User user) {
        requireUser(user);
        return getEntitlements(user.getId());
    }

    public boolean canCreateVaultItem(User user, long currentVaultCount) {
        long limit = getEntitlements(user).maxPasswords();
        return limit < 0 || currentVaultCount < limit;
    }

    public long getFreePasswordLimit() {
        return 10;
    }

    public boolean canCreateSecureNote(User user, long currentNoteCount) {
        long limit = getEntitlements(user).maxSecureNotes();
        return limit < 0 || currentNoteCount < limit;
    }

    public boolean canCreateEmergencyContact(User user, long currentCount) {
        long limit = getEntitlements(user).maxEmergencyContacts();
        return limit < 0 || currentCount < limit;
    }

    public boolean canUploadDocuments(User user) {
        return getEntitlements(user).canUploadDocuments();
    }

    public boolean canUseBackup(User user) {
        return getEntitlements(user).canUseBackup();
    }

    public boolean isFamilyPlan(User user) {
        return getEntitlements(user).canShareVault();
    }

    public boolean canShareVault(User user) {
        return getEntitlements(user).canShareVault();
    }

    public boolean canUseAdvancedSecurity(User user) {
        return getEntitlements(user).canUseAdvancedSecurity();
    }

    public boolean canUseAdvancedPasswordGenerator(User user) {
        return getEntitlements(user).canUseAdvancedPasswordGenerator();
    }

    public boolean canUseBreachMonitoring(User user) {
        return getEntitlements(user).canUseBreachMonitoring();
    }

    public boolean canUseEmergencyVaultItemSharing(User user) {
        return getEntitlements(user).canUseEmergencyVaultItemSharing();
    }

    public boolean canUseCustomEmergencyWaitingPeriod(User user) {
        return getEntitlements(user).canUseCustomEmergencyWaitingPeriod();
    }

    private void requireUser(User user) {
        if (user == null || user.getId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authenticated user could not be resolved."
            );
        }
    }

    private void requireUserId(Long userId) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User id is required.");
        }
    }

    private ResponseStatusException unavailable(String message) {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, message);
    }
}