package com.vault.theguardian.backuprecovery.access;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Component
public class AccessSharingClient {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public AccessSharingClient(
            RestClient.Builder builder,
            @Value("${services.access-sharing.url}") String accessSharingServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(accessSharingServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public FamilyBackupResponse exportFamily(Long userId) {
        try {
            FamilyBackupResponse response = restClient.get()
                    .uri("/internal/family/backups/users/{userId}", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(FamilyBackupResponse.class);

            return response == null
                    ? new FamilyBackupResponse(false, null, null, List.of(), 0)
                    : response;
        } catch (RestClientException exception) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Access Sharing Service is temporarily unavailable.",
                    exception
            );
        }
    }
}
