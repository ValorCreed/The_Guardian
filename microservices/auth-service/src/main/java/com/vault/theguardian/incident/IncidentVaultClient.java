package com.vault.theguardian.incident;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Arrays;
import java.util.List;

@Component
public class IncidentVaultClient {
    private static final Logger log = LoggerFactory.getLogger(IncidentVaultClient.class);
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public IncidentVaultClient(
            RestClient.Builder builder,
            @Value("${services.vault.url:http://localhost:8083}") String vaultServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(vaultServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public List<IncidentVaultItem> listPasswords(Long userId) {
        try {
            IncidentVaultItem[] response = restClient.get()
                    .uri("/internal/vault/users/{userId}/PASSWORD", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(IncidentVaultItem[].class);
            return response == null ? List.of() : Arrays.asList(response);
        } catch (RestClientException exception) {
            log.warn("Incident Lockdown could not snapshot vault priorities for user {}: {}",
                    userId, exception.getMessage());
            return List.of();
        }
    }
}
