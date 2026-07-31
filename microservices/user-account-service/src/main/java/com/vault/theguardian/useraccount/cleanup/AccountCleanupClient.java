package com.vault.theguardian.useraccount.cleanup;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Component
public class AccountCleanupClient {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient vaultClient;
    private final RestClient accessSharingClient;
    private final RestClient backupRecoveryClient;
    private final RestClient subscriptionClient;
    private final RestClient notificationClient;
    private final String internalServiceKey;

    public AccountCleanupClient(
            @Value("${services.vault.url}") String vaultServiceUrl,
            @Value("${services.access-sharing.url}") String accessSharingServiceUrl,
            @Value("${services.backup-recovery.url}") String backupRecoveryServiceUrl,
            @Value("${services.subscription.url}") String subscriptionServiceUrl,
            @Value("${services.notification.url}") String notificationServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.vaultClient = RestClient.builder().baseUrl(vaultServiceUrl).build();
        this.accessSharingClient = RestClient.builder().baseUrl(accessSharingServiceUrl).build();
        this.backupRecoveryClient = RestClient.builder().baseUrl(backupRecoveryServiceUrl).build();
        this.subscriptionClient = RestClient.builder().baseUrl(subscriptionServiceUrl).build();
        this.notificationClient = RestClient.builder().baseUrl(notificationServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public void deleteVaultData(Long userId) {
        delete(
                vaultClient,
                "/internal/vault/data/users/{userId}",
                userId,
                "Vault Service"
        );
    }

    public void deleteAccessSharingData(Long userId) {
        delete(
                accessSharingClient,
                "/internal/account/users/{userId}",
                userId,
                "Access Sharing Service"
        );
    }

    public void deleteBackupRecoveryData(Long userId) {
        delete(
                backupRecoveryClient,
                "/internal/account/users/{userId}",
                userId,
                "Backup & Recovery Service"
        );
    }

    public void deleteBillingData(Long userId) {
        delete(
                subscriptionClient,
                "/internal/subscriptions/users/{userId}",
                userId,
                "Subscription Service"
        );
    }

    public void deleteNotifications(Long userId) {
        delete(
                notificationClient,
                "/internal/notifications/users/{userId}",
                userId,
                "Notification Service"
        );
    }

    private void delete(
            RestClient client,
            String path,
            Long userId,
            String serviceName
    ) {
        try {
            client.delete()
                    .uri(path, userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException exception) {
            throw new ResponseStatusException(
                    exception.getStatusCode(),
                    serviceName + " could not clean up account data.",
                    exception
            );
        } catch (RestClientException exception) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    serviceName + " is temporarily unavailable.",
                    exception
            );
        }
    }
}
