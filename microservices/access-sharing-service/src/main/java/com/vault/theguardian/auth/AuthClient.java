package com.vault.theguardian.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collection;
import java.util.List;

@Component
public class AuthClient {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public AuthClient(
            RestClient.Builder builder,
            @Value("${services.auth.url}") String authServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(authServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public TokenIntrospectionResponse introspect(String token) {
        try {
            TokenIntrospectionResponse response = restClient.post()
                    .uri("/internal/auth/introspect")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve()
                    .body(TokenIntrospectionResponse.class);
            return response == null
                    ? new TokenIntrospectionResponse(false, null, null)
                    : response;
        } catch (RestClientException exception) {
            throw new AuthServiceUnavailableException(
                    "Auth Service could not validate the session.", exception
            );
        }
    }

    public InternalUserResponse findByEmail(String email) {
        try {
            return restClient.get()
                    .uri(uri -> uri.path("/internal/users/by-email")
                            .queryParam("email", email)
                            .build())
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(InternalUserResponse.class);
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 404) return null;
            throw upstreamFailure(exception);
        } catch (RestClientException exception) {
            throw upstreamFailure(exception);
        }
    }

    public InternalUserResponse findById(Long userId) {
        try {
            return restClient.get()
                    .uri("/internal/users/{userId}", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(InternalUserResponse.class);
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 404) return null;
            throw upstreamFailure(exception);
        } catch (RestClientException exception) {
            throw upstreamFailure(exception);
        }
    }

    public List<InternalUserResponse> findByIds(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) return List.of();
        try {
            List<InternalUserResponse> response = restClient.post()
                    .uri("/internal/users/batch")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(userIds.stream().distinct().toList())
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<InternalUserResponse>>() {});
            return response == null ? List.of() : response;
        } catch (RestClientException exception) {
            throw upstreamFailure(exception);
        }
    }

    public InternalUserResponse requireById(Long userId) {
        InternalUserResponse user = findById(userId);
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User account not found.");
        }
        return user;
    }

    private ResponseStatusException upstreamFailure(Exception exception) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Auth Service is temporarily unavailable.",
                exception
        );
    }
}
