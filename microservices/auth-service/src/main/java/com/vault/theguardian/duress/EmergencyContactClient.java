package com.vault.theguardian.duress;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Component
public class EmergencyContactClient {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public EmergencyContactClient(
            RestClient.Builder builder,
            @Value("${services.access-sharing.url:${ACCESS_SHARING_SERVICE_URL:http://localhost:8085}}") String baseUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(baseUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public List<InternalEmergencyContactResponse> findEligibleContacts(Long ownerId) {
        try {
            List<InternalEmergencyContactResponse> contacts = restClient.get()
                    .uri("/internal/emergency/recovery-contacts/owners/{ownerId}", ownerId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});
            return contacts == null ? List.of() : contacts;
        } catch (RestClientException exception) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Trusted contacts are temporarily unavailable.",
                    exception
            );
        }
    }
}
