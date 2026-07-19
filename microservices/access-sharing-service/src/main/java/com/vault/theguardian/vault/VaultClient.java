package com.vault.theguardian.vault;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collection;
import java.util.List;

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

    public List<InternalVaultItemResponse> list(Long ownerId, String itemType) {
        try {
            List<InternalVaultItemResponse> response = restClient.get()
                    .uri("/internal/vault/users/{ownerId}/{itemType}", ownerId, itemType)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<InternalVaultItemResponse>>() {});
            return response == null ? List.of() : response;
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    public InternalVaultItemResponse get(Long ownerId, String itemType, Long itemId) {
        try {
            InternalVaultItemResponse response = restClient.get()
                    .uri("/internal/vault/users/{ownerId}/{itemType}/{itemId}",
                            ownerId, itemType, itemId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(InternalVaultItemResponse.class);
            if (response == null) throw unavailable(null);
            return response;
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Vault item not found.");
            }
            if (exception.getStatusCode().value() == 403) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Vault item does not belong to the requested owner.");
            }
            throw unavailable(exception);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }


    public InternalVaultItemResponse getOrNull(
            Long ownerId,
            String itemType,
            Long itemId
    ) {
        try {
            return restClient.get()
                    .uri("/internal/vault/users/{ownerId}/{itemType}/{itemId}",
                            ownerId, itemType, itemId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(InternalVaultItemResponse.class);
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 404
                    || exception.getStatusCode().value() == 403) {
                return null;
            }
            throw unavailable(exception);
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    public DownloadedDocument downloadDocument(Long ownerId, Long itemId) {
        try {
            ResponseEntity<byte[]> response = restClient.get()
                    .uri("/internal/vault/users/{ownerId}/documents/{itemId}/download", ownerId, itemId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .toEntity(byte[].class);

            byte[] bytes = response.getBody() == null ? new byte[0] : response.getBody();
            String contentDisposition = response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
            String fileName = extractFileName(contentDisposition);
            String contentType = response.getHeaders().getContentType() == null
                    ? "application/octet-stream"
                    : response.getHeaders().getContentType().toString();

            return new DownloadedDocument(bytes, fileName, contentType);
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    public List<InternalPasswordRiskResponse> passwordRisks(Collection<Long> ownerIds) {
        if (ownerIds == null || ownerIds.isEmpty()) return List.of();

        try {
            List<InternalPasswordRiskResponse> response = restClient.post()
                    .uri("/internal/vault/password-risks")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(ownerIds.stream().distinct().toList())
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<InternalPasswordRiskResponse>>() {});
            return response == null ? List.of() : response;
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    private String extractFileName(String contentDisposition) {
        if (contentDisposition == null || contentDisposition.isBlank()) return "document";
        int marker = contentDisposition.indexOf("filename=");
        if (marker < 0) return "document";
        String value = contentDisposition.substring(marker + "filename=".length()).trim();
        if (value.startsWith("\"") && value.endsWith("\"") && value.length() > 1) {
            value = value.substring(1, value.length() - 1);
        }
        return value.isBlank() ? "document" : value;
    }

    private ResponseStatusException unavailable(Exception cause) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Vault Service is temporarily unavailable.",
                cause
        );
    }
}
