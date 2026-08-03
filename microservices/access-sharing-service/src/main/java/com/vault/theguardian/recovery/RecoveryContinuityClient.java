package com.vault.theguardian.recovery;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Component
public class RecoveryContinuityClient {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public RecoveryContinuityClient(
            RestClient.Builder builder,
            @Value("${services.backup-recovery.url}") String backupRecoveryServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(backupRecoveryServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public RecoveryContinuitySnapshot getSnapshot(Long ownerId) {
        try {
            RecoveryContinuitySnapshot response = restClient.get()
                    .uri("/internal/continuity/users/{ownerId}", ownerId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(RecoveryContinuitySnapshot.class);

            return response == null
                    ? new RecoveryContinuitySnapshot(false, false, 0, false, List.of())
                    : response;
        } catch (RestClientException exception) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Backup Recovery Service is temporarily unavailable.",
                    exception
            );
        }
    }
}
