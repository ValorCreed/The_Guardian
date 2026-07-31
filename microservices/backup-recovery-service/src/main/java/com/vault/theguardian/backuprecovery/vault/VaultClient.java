package com.vault.theguardian.backuprecovery.vault;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

@Component
public class VaultClient {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public VaultClient(
            RestClient.Builder builder,
            @Value("${services.vault.url}") String vaultServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(vaultServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public VaultBackupResponse exportBackup(Long userId) {
        try {
            VaultBackupResponse response = restClient.get()
                    .uri("/internal/vault/backups/users/{userId}", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(VaultBackupResponse.class);
            if (response == null) throw unavailable(null);
            return response;
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    public VaultRestoreResponse restore(Long userId, VaultRestoreRequest request) {
        try {
            VaultRestoreResponse response = restClient.post()
                    .uri("/internal/vault/backups/users/{userId}/restore", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(request)
                    .retrieve()
                    .body(VaultRestoreResponse.class);
            if (response == null) throw unavailable(null);
            return response;
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    public VaultDeleteResponse deleteAll(Long userId) {
        try {
            VaultDeleteResponse response = restClient.delete()
                    .uri("/internal/vault/data/users/{userId}", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(VaultDeleteResponse.class);
            if (response == null) throw unavailable(null);
            return response;
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    private ResponseStatusException unavailable(Throwable cause) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Vault Service is temporarily unavailable.",
                cause
        );
    }
}
