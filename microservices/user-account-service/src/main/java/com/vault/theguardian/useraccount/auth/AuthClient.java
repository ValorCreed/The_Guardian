package com.vault.theguardian.useraccount.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

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

    public boolean verifyPassword(Long userId, String password) {
        try {
            PasswordVerificationResponse response = restClient.post()
                    .uri("/internal/recovery/users/{userId}/verify-password", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(new VerifyPasswordRequest(password))
                    .retrieve()
                    .body(PasswordVerificationResponse.class);
            return response != null && response.valid();
        } catch (RestClientResponseException exception) {
            throw new ResponseStatusException(
                    exception.getStatusCode(),
                    "Auth Service could not verify the account password.",
                    exception
            );
        } catch (RestClientException exception) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Auth Service is temporarily unavailable.",
                    exception
            );
        }
    }

    public void deleteUser(Long userId) {
        try {
            restClient.delete()
                    .uri("/internal/users/{userId}", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException exception) {
            throw new ResponseStatusException(
                    exception.getStatusCode(),
                    "Auth Service could not delete the user account.",
                    exception
            );
        } catch (RestClientException exception) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Auth Service is temporarily unavailable.",
                    exception
            );
        }
    }

    private record VerifyPasswordRequest(String password) {}
}
